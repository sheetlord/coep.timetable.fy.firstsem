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

    # Full grid coverage — match actual schedule format
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    full_time_slots = [
        '08:30 - 09:30',
        '09:30 - 10:30',
        '10:30 - 11:30',
        '11:30 - 12:30',
        '12:30 - 01:30',
        '01:30 - 02:30',
        '02:30 - 03:30',
        '03:30 - 04:30',
        '04:30 - 05:30',
        '05:30 - 06:30'
    ]

    unique_days = days_order
    unique_time_slots = full_time_slots

    # Build empty grid
    grid = {time: {day: None for day in unique_days} for time in unique_time_slots}

    # Normalize time and day for matching
    def normalize_time(t):
        return t.replace('-', ' - ').strip()

    def normalize_day(d):
        return d.capitalize()

    # Fill grid with actual schedule data
    for row in schedule_data:
        time_key = normalize_time(row['time'])
        day_key = normalize_day(row['day'])
        if time_key in grid and day_key in grid[time_key]:
            grid[time_key][day_key] = dict(row)

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

