from flask import Flask, render_template, request, jsonify
import sqlite3
import os

app = Flask(__name__)

# This new code makes sure the server can always find your database file.
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'schedule.db')

def get_db_connection():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_schedule', methods=['POST'])
def get_schedule():
    mis_number = request.form.get('mis_number')
    if not mis_number:
        return jsonify({'error': 'MIS number is required.'}), 400

    conn = get_db_connection()

    # Get student's name and branch
    student_info = conn.execute(
        'SELECT full_name, branch FROM student_divisions WHERE mis_number = ? LIMIT 1',
        (mis_number,)
    ).fetchone()

    if not student_info:
        conn.close()
        return jsonify({'error': f'No student found with MIS number {mis_number}. Please check the number.'})

    # Get all matching class data
    schedule_query = """
        SELECT DISTINCT t.day, t.time, t.room, t.division, t.subject
        FROM timetables AS t
        JOIN student_divisions AS s ON t.division = s.division AND t.subject = s.subject
        WHERE s.mis_number = ?
    """
    schedule_data = conn.execute(schedule_query, (mis_number,)).fetchall()
    conn.close()

    # --- START OF CHANGES ---

    # 1. Define the complete structure of your college's timetable.
    #    You can customize these lists to match your college's full schedule!
    all_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    all_time_slots = [
        "08:30 - 09:30", "09:30 - 10:30", "10:30 - 11:30", "11:30 - 12:30",
        "12:30 - 01:30", "01:30 - 02:30", "02:30 - 03:30", "03:30 - 04:30",
        "04:30 - 05:30"
    ]

    # 2. Create a complete, empty grid using these full lists.
    grid = {time: {day: None for day in all_days} for time in all_time_slots}

    # 3. Populate the grid with the classes you found.
    for row in schedule_data:
        # This check prevents errors if a time/day from the database isn't in our master list.
        if row['time'] in grid and row['day'] in grid[row['time']]:
            grid[row['time']][row['day']] = dict(row)

    # --- END OF CHANGES ---

    return jsonify({
        'student_name': student_info['full_name'],
        'branch': student_info['branch'],
        'schedule': {
            'days': all_days,            # Use the full list for the columns
            'time_slots': all_time_slots, # Use the full list for the rows
            'grid': grid                 # The populated grid
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)