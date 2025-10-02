document.getElementById('scheduleForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const misNumber = document.getElementById('mis_number').value;
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

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