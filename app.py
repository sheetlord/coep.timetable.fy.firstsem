from flask import Flask, render_template, request, jsonify  # <-- 1. IMPORTED jsonify
import sqlite3
import os

app = Flask(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'schedule.db')

def get_db_connection():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    # This route is correct, it should send the HTML page
    return render_template('index.html')

@app.route('/get_schedule', methods=['POST'])
def get_schedule():
    mis_number = request.form.get('mis_number')
    if not mis_number:
        # <-- 2. RETURN JSON ERROR
        return jsonify({"error": "MIS number is required."})

    conn = None  # Initialize connection to None
    try:
        conn = get_db_connection()
        student_info = conn.execute(
            'SELECT full_name, branch FROM student_divisions WHERE mis_number = ? LIMIT 1',
            (mis_number,)
        ).fetchone()

        if not student_info:
            # <-- 3. RETURN JSON ERROR
            return jsonify({"error": f"No student found with MIS number {mis_number}."})

        schedule_query = """
            SELECT DISTINCT t.day, t.time, t.room, t.division, t.subject
            FROM timetables AS t
            JOIN student_divisions AS s ON t.division = s.division AND t.subject = s.subject
            WHERE s.mis_number = ?
        """
        schedule_data = conn.execute(schedule_query, (mis_number,)).fetchall()

        days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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

        grid = {time: {day: None for day in days_order} for time in full_time_slots}

        def normalize_time(t):
            return t.replace('-', ' - ').strip()

        def normalize_day(d):
            return d.capitalize()

        for row in schedule_data:
            time_key = normalize_time(row['time'])
            day_key = normalize_day(row['day'])
            if time_key in grid and day_key in grid[time_key]:
                # Convert the database row to a simple dict for JSON
                grid[time_key][day_key] = dict(row)

        # <-- 4. RETURN JSON DATA (THE MAIN FIX)
        return jsonify({
            "student_name": student_info['full_name'],
            "branch": student_info['branch'],
            "schedule": {
                "days": days_order,
                "time_slots": full_time_slots,
                "grid": grid
            }
        })
    
    except Exception as e:
        # Send a JSON error if the database code fails
        print(f"An error occurred: {e}") # For your debugging
        return jsonify({"error": "An internal server error occurred."})

    finally:
        # This ensures the database connection is always closed
        if conn:
            conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)