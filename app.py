from flask import Flask, render_template, request, jsonify
import sqlite3
import os

app = Flask(__name__)

# Ensure the server can always find your database file
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

    if not schedule_data:
        return jsonify({
            'student_name': student_info['full_name'],
            'branch': student_info['branch'],
            'schedule': {}
        })

    # Full grid coverage — always show all days and time slots
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    full_time_slots = [
        '09:00 - 10:00',
        '10:00 - 11:00',
        '11:00 - 12:00',
        '12:00 - 01:00',
        '01:00 - 02:00',
        '02:00 - 03:00',
        '03:00 - 04:00',
        '04:00 - 05:00'
    ]

    unique_days = days_order
    unique_time_slots = full_time_slots

    # Build empty grid
    grid = {time: {day: None for day in unique_days} for time in unique_time_slots}

    # Fill grid with actual schedule data
    for row in schedule_data:
        if row['time'] in grid and row['day'] in grid[row['time']]:
            grid[row['time']][row['day']] = dict(row)

    return jsonify({
        'student_name': student_info['full_name'],
        'branch': student_info['branch'],
        'schedule': {
            'days': unique_days,
            'time_slots': unique_time_slots,
            'grid': grid
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)