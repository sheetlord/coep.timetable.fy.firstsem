from flask import Flask, render_template, request, jsonify
import sqlite3
import os  # <-- ADDED THIS LINE

app = Flask(__name__)

# --- REPLACED THIS SECTION ---
# This new code makes sure the server can always find your database file.
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'schedule.db')

def get_db_connection():
    conn = sqlite3.connect(db_path) # <-- CHANGED THIS LINE
    conn.row_factory = sqlite3.Row
    return conn
# --- END OF REPLACED SECTION ---


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

    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    unique_days = sorted(list(set(row['day'] for row in schedule_data)), key=days_order.index)
    
    def time_sort_key(time_str):
        start_time_str = time_str.split('-')[0].strip()
        h, m = map(int, start_time_str.split(':'))
        if 1 <= h <= 7:
            h += 12
        return h * 100 + m

    unique_time_slots = sorted(list(set(row['time'] for row in schedule_data)), key=time_sort_key)

    grid = {time: {day: None for day in unique_days} for time in unique_time_slots}

    for row in schedule_data:
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
    app.run(host='0.0.0.0', debug=True) # <-- Added host='0.0.0.0'