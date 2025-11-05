let trackerInterval = null;
let logQueue = []; 
async function sendLogBatch() {
    if (logQueue.length === 0) return;
    const batch = db.batch();
    const logsToSend = [...logQueue];
    logQueue = [];
    logsToSend.forEach(log => {
        const logRef = db.collection("logs").doc();
        batch.set(logRef, log);
    });
    try { await batch.commit(); } catch (e) {
        console.error("Error sending log batch: ", e);
        logQueue = [...logsToSend, ...logQueue];
    }
}

// --- 2. FORM LISTENER (UPDATED) ---
document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (trackerInterval) clearInterval(trackerInterval);

    const misNumber = document.getElementById('mis_number').value;
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

    try { logQueue.push({ mis: misNumber, timestamp: new Date() }); } catch (e) { console.error('Error queuing log:', e); }

    resultDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('mis_number', misNumber);

        const response = await fetch('/get_schedule', { method: 'POST', body: formData });
        const data = await response.json();

        if (data.error) {
            resultDiv.innerHTML = `<p class="error">${data.error}</p>`;
            return; 
        }
        
        let { days, time_slots, grid } = data.schedule;
        const studentData = data.student_data;

        // Fetch and merge extra classes
        if (studentData && studentData.subject_map && studentData.subjects_list) {
            grid = await fetchAndMergeExtraClasses(grid, studentData);
        } else {
            console.log("No student data found, skipping extra class check.");
        }

        // (Header/no-grid logic is unchanged)
        let headerInfo = `<h2>${data.student_name} <span class="branch">(${data.branch})</span></h2>`;
        if (!grid) {
            resultDiv.innerHTML = headerInfo + "<p>No classes found.</p>";
            loadingDiv.classList.add('hidden');
            return;
        }

        // --- TABLE BUILDING LOGIC (UPDATED) ---
        let tableHtml = `
            <div class="timetable-container">
                <table id="timetable-grid" class="timetable"> 
                    <thead><tr><th class="time-slot">Time</th>`;
        days.forEach((day, index) => {
            tableHtml += `<th data-day="${day}" data-col-index="${index}">${day}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;
        time_slots.forEach(time => {
            tableHtml += `<tr data-time-slot="${time}"><th class="time-slot">${time}</th>`;
            days.forEach((day, index) => {
                const classInfo = grid[time][day];
                if (classInfo) {
                    const isExtraClass = classInfo.isExtra || false;
                    const highlightClass = isExtraClass ? 'extra-class-highlight' : '';
                    
                    // --- THIS IS THE NEW LABEL ---
                    const extraClassLabel = isExtraClass ? '<span class="extra-class-label">EXTRA CLASS</span>' : '';
                    
                    tableHtml += `
                        <td data-col-index="${index}" class="${highlightClass}"> 
                            <div class="class-details">
                                ${extraClassLabel} <span class="class-subject">${classInfo.subject}</span>
                                <strong>Room:</strong> ${classInfo.room}<br>
                                <strong>Division:</strong> ${classInfo.division}
                            </div>
                        </td>`;
                } else {
                    tableHtml += `<td data-col-index="${index}"></td>`; 
                }
            });
            tableHtml += '</tr>';
        });
        tableHtml += `</tbody></table></div>`;
        resultDiv.innerHTML = headerInfo + tableHtml;
        startRealTimeTracker(); 
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">An unexpected error occurred. Please try again.</p>`;
        console.error('Error fetching schedule:', error);
    } finally {
        loadingDiv.classList.add('hidden');
    }
});

// --- 3. LOG TIMERS (Unchanged) ---
setInterval(sendLogBatch, 60000);
window.addEventListener('beforeunload', sendLogBatch);


// --- 4. FETCH & MERGE (Unchanged) ---
async function fetchAndMergeExtraClasses(grid, studentData) {
    console.log("--- DEBUG: Fetching extra classes ---");
    
    const studentMap = studentData.subject_map; 
    console.log("Student's subject/division pairs:", studentMap);

    const allSubjects = studentData.subjects_list;
    const filteredSubjects = allSubjects.filter(subject => {
        const s = subject.trim();
        if (s.startsWith('LAB Batch') || s.includes("Communication Skills") || s.includes("Personality Development") ||
            s.startsWith('PD-') || s.startsWith('1st and 3rd Sat-PD-') || s.startsWith('2nd & 4th Sat-PD-')) {
            return false;
        }
        return true;
    });
    console.log("Filtered subjects for query:", filteredSubjects);

    const now = firebase.firestore.Timestamp.now();
    if (filteredSubjects.length === 0) {
        console.log("--- DEBUG: No schedulable subjects found after filtering. Skipping query. ---");
        return grid;
    }
    
    try {
        const querySnapshot = await db.collection("extraClasses")
            .where("expiry", ">", now)
            .where("subject", "in", filteredSubjects)
            .get();

        if (querySnapshot.empty) {
            console.log("--- DEBUG: No extra classes found in Firestore matching subjects. ---");
            return grid;
        }

        console.log(`--- DEBUG: Found ${querySnapshot.size} potential class(es). Now checking divisions... ---`);
        
        querySnapshot.forEach(doc => {
            const ec = doc.data(); 
            const isMatch = studentMap.some(pair => 
                pair.subject === ec.subject && pair.division === ec.division
            );
            
            if (!isMatch) {
                console.warn(`--- DEBUG WARNING: Found class "${ec.subject}" for "${ec.division}", but student is not in that pair. Skipping. ---`);
                return;
            }
            
            const startTime = ec.startTime.toDate();
            const endTime = ec.endTime.toDate();
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const day = dayNames[startTime.getDay()];
            const timeSlot = formatFirebaseTimeSlot(startTime, endTime);
            
            console.log(`--- DEBUG: Processing class: ${ec.subject} on ${day} at ${timeSlot} ---`);

            if (grid[timeSlot] === undefined) {
                console.error(`--- DEBUG ERROR: The time slot key "${timeSlot}" does not exist in the grid! ---`);
                return; 
            }
            if (grid[timeSlot][day] === undefined) {
                console.error(`--- DEBUG ERROR: The day key "${day}" does not exist in grid["${timeSlot}"]! ---`);
                return; 
            }
            if (grid[timeSlot][day] === null) {
                console.log(`--- DEBUG SUCCESS: Merging "${ec.subject}" into the grid. ---`);
                grid[timeSlot][day] = {
                    subject: ec.subject,
                    room: ec.room,
                    division: ec.division,
                    isExtra: true
                };
            } else {
                console.warn(`--- DEBUG WARNING: Slot is already full. "${grid[timeSlot][day].subject}" is already there. ---`);
            }
        });
        
    } catch (error) {
        console.error("--- DEBUG FATAL ERROR: Error fetching extra classes: ---", error);
    }
    console.log("--- DEBUG: Returning modified grid. ---");
    return grid; 
}

// (Helper function unchanged)
function formatFirebaseTimeSlot(start, end) {
    const format = (date) => {
        let h = date.getHours();
        let m = date.getMinutes().toString().padStart(2, '0');
        if (h > 12) h -= 12;
        if (h === 0) h = 12; 
        return String(h).padStart(2, '0') + ':' + m;
    };
    return `${format(start)} - ${format(end)}`;
}


// --- 5. REAL-TIME TRACKER (Unchanged) ---
function convertTo24Hour(timeStr) {
    const [hour, minute] = timeStr.split(':');
    let hourInt = parseInt(hour, 10);
    if (hourInt >= 1 && hourInt <= 7) { 
        hourInt += 12;
    }
    return String(hourInt).padStart(2, '0') + ':' + minute;
}
function startRealTimeTracker() {
    updateHighlighter();
    trackerInterval = setInterval(updateHighlighter, 10000); 
}
function updateHighlighter() {
    const now = new Date();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDay = dayNames[now.getDay()]; 
    const currentTime = now.toTimeString().slice(0, 5); 

    document.querySelectorAll('.current-day-header, .current-time-header, .current-time-row, .current-day-col')
        .forEach(el => {
            el.classList.remove('current-day-header', 'current-time-header', 'current-time-row', 'current-day-col');
        });
        
    const dayHeader = document.querySelector(`#timetable-grid th[data-day="${currentDay}"]`);
    if (dayHeader) {
        dayHeader.classList.add('current-day-header');
        const colIndex = dayHeader.getAttribute('data-col-index');
        const dayCells = document.querySelectorAll(`#timetable-grid td[data-col-index="${colIndex}"]`);
        dayCells.forEach(cell => {
            cell.classList.add('current-day-col');
        });
    }

    const allTimeSlots = document.querySelectorAll('#timetable-grid tr[data-time-slot]');
    allTimeSlots.forEach(row => {
        const timeSlot = row.getAttribute('data-time-slot');
        if (!timeSlot) return;
        const [startTime12, endTime12] = timeSlot.split('-').map(s => s.trim());
        const startTime24 = convertTo24Hour(startTime12);
        const endTime24 = convertTo24Hour(endTime12);
        if (currentTime >= startTime24 && currentTime < endTime24) {
            row.classList.add('current-time-row');
            const timeHeader = row.querySelector('th');
            if (timeHeader) {
                timeHeader.classList.add('current-time-header');
            }
        }
    });
}


// --- 6. NOTICE BOARD (Unchanged) ---
(function fetchNotices() {
    console.log("Checking for site notices...");
    const noticeContainer = document.getElementById('notice-board-container');
    const noticeListDiv = document.getElementById('notice-list');
    noticeListDiv.innerHTML = ""; 
    const now = firebase.firestore.Timestamp.now();
    db.collection("notices").where("expiry", ">", now).orderBy("expiry", "asc").get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
                noticeContainer.classList.add('hidden');
                return;
            }
            let serialNumber = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const message = data.message;
                if (message && message.trim() !== "") {
                    const noticeItem = document.createElement('div');
                    noticeItem.className = 'notice-item';
                    noticeItem.innerHTML = `<span class="notice-item-sr">${serialNumber}.</span> <span>${message.replace(/\n/g, '<br>')}</span>`;
                    noticeListDiv.appendChild(noticeItem);
                    serialNumber++;
                }
            });
            if (serialNumber > 1) {
                noticeContainer.classList.remove('hidden');
            } else {
                noticeContainer.classList.add('hidden');
            }
        })
        .catch((error) => {
            console.error("Error fetching notices: ", error);
            noticeContainer.classList.add('hidden');
        });
})();