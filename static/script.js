// --- 1. SET UP BATCH LOGGING ---
let logQueue = []; // An array to hold logs

// Function to send the batch (this assumes 'db' exists from index.html)
async function sendLogBatch() {
    // Step 1: Check if there's anything to send
    if (logQueue.length === 0) {
        console.log("No logs to send.");
        return; // Do nothing
    }

    // 'db' is the global variable we defined in index.html
    const batch = db.batch();

    // Step 2: Copy the current queue and clear the main one *immediately*
    const logsToSend = [...logQueue];
    logQueue = [];
    console.log(`Sending batch of ${logsToSend.length} logs...`);

    // Step 3: Add all logs from our copy to the batch
    logsToSend.forEach(log => {
        const logRef = db.collection("logs").doc(); // Create a new empty doc
        batch.set(logRef, log); // Add the log to the batch
    });

    // Step 4: Send the batch (this counts as 1 WRITE)
    try {
        await batch.commit();
        console.log("Log batch sent successfully!");
    } catch (e) {
        console.error("Error sending log batch: ", e);
        // If it fails, add the logs back to the main queue to try again next time
        logQueue = [...logsToSend, ...logQueue];
    }
}

// --- 2. YOUR EXISTING FORM LISTENER (NOW WITH LOGGING) ---

document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const misNumber = document.getElementById('mis_number').value;
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

    // --- ⬇️ ADDED LOGGING CODE ⬇️ ---
    // Add the log to our queue. The timer will send it.
    try {
        logQueue.push({
            mis: misNumber,
            timestamp: new Date() // Use the client's current time
        });
        console.log('MIS logged to queue.');
    } catch (e) {
        console.error('Error queuing log:', e);
    }
    // --- ⬆️ END OF ADDED CODE ⬆️ ---

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
            // --- NEW TABLE BUILDING LOGIC ---

            // Display student name and branch
            let headerInfo = `
                <h2>${data.student_name}
                    <span class="branch">(${data.branch})</span>
                </h2>`;

            // Check if schedule is empty
            if (!data.schedule.grid) {
                resultDiv.innerHTML = headerInfo + "<p>No classes found for your registered subjects.</p>";
                loadingDiv.classList.add('hidden'); // Also hide loading here
                return;
            }

            const { days, time_slots, grid } = data.schedule;

            // Start building the table HTML
            let tableHtml = `
                <div class="timetable-container">
                    <table class="timetable">
                        <thead>
                            <tr>
                                <th class="time-slot">Time</th>`;
            // Create day headers
            days.forEach(day => {
                tableHtml += `<th>${day}</th>`;
            });
            tableHtml += `
                            </tr>
                        </thead>
                        <tbody>`;

            // Create a row for each time slot
            time_slots.forEach(time => {
                tableHtml += `<tr><th class="time-slot">${time}</th>`;
                // Create a cell for each day in that time slot
                days.forEach(day => {
                    const classInfo = grid[time][day];
                    if (classInfo) {
                        tableHtml += `
                            <td>
                                <div class="class-details">
                                    <span class="class-subject">${classInfo.subject}</span>
                                    <strong>Room:</strong> ${classInfo.room}<br>
                                    <strong>Division:</strong> ${classInfo.division}
                                </div>
                            </td>`;
                    } else {
                        tableHtml += '<td></td>'; // Empty cell if no class
                    }
                });
                tableHtml += '</tr>';
            });

            tableHtml += `
                        </tbody>
                    </table>
                </div>`;
            
            resultDiv.innerHTML = headerInfo + tableHtml;
        }
    } catch (error) {
        resultDiv.innerHTML = `<p class="error">An unexpected error occurred. Please try again.</p>`;
        console.error('Error fetching schedule:', error);
    } finally {
        loadingDiv.classList.add('hidden');
    }
});

// --- 3. START THE TIMERS ---

// Set up the timer to run sendLogBatch() every 60 seconds
setInterval(sendLogBatch, 60000); // 60,000 milliseconds = 1 minute

// (Recommended) Try to send any remaining logs when the user closes the tab
window.addEventListener('beforeunload', sendLogBatch);