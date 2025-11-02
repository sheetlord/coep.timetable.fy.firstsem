let trackerInterval = null;

// --- 1. SET UP BATCH LOGGING ---
let logQueue = []; // An array to hold logs

async function sendLogBatch() {
    if (logQueue.length === 0) {
        return;
    }
    const batch = db.batch();
    const logsToSend = [...logQueue];
    logQueue = [];
    console.log(`Sending batch of ${logsToSend.length} logs...`);

    logsToSend.forEach(log => {
        const logRef = db.collection("logs").doc();
        batch.set(logRef, log);
    });

    try {
        await batch.commit();
        console.log("Log batch sent successfully!");
    } catch (e) {
        console.error("Error sending log batch: ", e);
        logQueue = [...logsToSend, ...logQueue];
    }
}

// --- 2. FORM LISTENER ---
document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (trackerInterval) {
        clearInterval(trackerInterval);
    }

    const misNumber = document.getElementById('mis_number').value;
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

    // --- Logging Code ---
    try {
        logQueue.push({
            mis: misNumber,
            timestamp: new Date()
        });
        console.log('MIS logged to queue.');
    } catch (e) {
        console.error('Error queuing log:', e);
    }
    // --- End Logging Code ---

    resultDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('mis_number', misNumber);

        const response = await fetch('/get_schedule', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.error) {
            resultDiv.innerHTML = `<p class="error">${data.error}</p>`;
        } else {
            let headerInfo = `
                <h2>${data.student_name}
                    <span class="branch">(${data.branch})</span>
                </h2>`;

            if (!data.schedule.grid) {
                resultDiv.innerHTML = headerInfo + "<p>No classes found for your registered subjects.</p>";
                loadingDiv.classList.add('hidden');
                return;
            }

            const { days, time_slots, grid } = data.schedule;

            // Added id="timetable-grid"
            let tableHtml = `
                <div class="timetable-container">
                    <table id="timetable-grid" class="timetable"> 
                        <thead>
                            <tr>
                                <th class="time-slot">Time</th>`;
            
            // Added data-day and data-col-index
            days.forEach((day, index) => {
                tableHtml += `<th data-day="${day}" data-col-index="${index}">${day}</th>`;
            });
            
            tableHtml += `
                            </tr>
                        </thead>
                        <tbody>`;

            time_slots.forEach(time => {
                // Added data-time-slot
                tableHtml += `<tr data-time-slot="${time}"><th class="time-slot">${time}</th>`;
                
                days.forEach((day, index) => {
                    const classInfo = grid[time][day];
                    if (classInfo) {
                        // Added data-col-index
                        tableHtml += `
                            <td data-col-index="${index}"> 
                                <div class="class-details">
                                    <span class="class-subject">${classInfo.subject}</span>
                                    <strong>Room:</strong> ${classInfo.room}<br>
                                    <strong>Division:</strong> ${classInfo.division}
                                </div>
                            </td>`;
                    } else {
                        // Added data-col-index
                        tableHtml += `<td data-col-index="${index}"></td>`; 
                    }
                });
                tableHtml += '</tr>';
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>`;
            
            resultDiv.innerHTML = headerInfo + tableHtml;
            
            // Start the tracker
            startRealTimeTracker(); 
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">An unexpected error occurred. Please try again.</p>`;
        console.error('Error fetching schedule:', error);
    } finally {
        loadingDiv.classList.add('hidden');
    }
});

// --- 3. LOG TIMERS ---
setInterval(sendLogBatch, 60000);
window.addEventListener('beforeunload', sendLogBatch);

// ----------------------------------------------
// --- REAL-TIME TRACKER FUNCTIONS ---
// ----------------------------------------------

function startRealTimeTracker() {
    updateHighlighter();
    trackerInterval = setInterval(updateHighlighter, 10000); // 10 seconds
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

        const [startTime, endTime] = timeSlot.split('-');

        if (currentTime >= startTime && currentTime < endTime) {
            row.classList.add('current-time-row');
            const timeHeader = row.querySelector('th');
            if (timeHeader) {
                timeHeader.classList.add('current-time-header');
            }
        }
    });
}

// ----------------------------------------------
// --- NOTICE BOARD FETCHER (v2 with Timer) ---
// ----------------------------------------------
(function fetchNotice() {
    console.log("Checking for site notice...");
    const noticeDiv = document.getElementById('notice-board');
    const noticeText = document.getElementById('notice-text');

    db.collection("config").doc("main_notice").get()
        .then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                const message = data.message; 
                const expiry = data.expiry; 

                const now = new Date(); 
                
                if (message && message.trim() !== "" && expiry && expiry.toDate() > now) {
                    // All checks passed! Show the notice.
                    console.log("Active notice found:", message);
                    
                    // Use innerHTML to allow for line breaks
                    noticeText.innerHTML = message.replace(/\n/g, '<br>'); 
                    
                    noticeDiv.classList.remove('hidden'); // Make the whole div visible
                } else {
                    // Notice is either empty or expired
                    console.log("No active notice.");
                    noticeDiv.classList.add('hidden'); // Ensure it stays hidden
                }
            } else {
                console.log("No notice document found.");
                noticeDiv.classList.add('hidden');
            }
        })
        .catch((error) => {
            console.error("Error fetching notice: ", error);
            noticeDiv.classList.add('hidden');
        });
})();