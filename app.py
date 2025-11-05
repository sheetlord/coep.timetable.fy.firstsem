from flask import Flask, render_template, request, jsonify
import sqlite3
import os
from collections import defaultdict

app = Flask(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'schedule.db')

def get_db_connection():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
def admin_panel():
    return render_template('admin.html')

@app.route('/get_admin_data')
def get_admin_data():
    conn = None
    try:
        conn = get_db_connection()
        query = "SELECT DISTINCT subject, division FROM student_divisions"
        rows = conn.execute(query).fetchall()
        
        subject_division_map = defaultdict(list)
        
        for row in rows:
            subject = row['subject']
            division = row['division']
            
            if not subject or not division:
                continue
            
            subject_str = subject.strip()
            if (subject_str.startswith('LAB Batch') or
                "Communication Skills" in subject_str or
                "Personality Development" in subject_str or
                subject_str.startswith('PD-') or
                subject_str.startswith('1st and 3rd Sat-PD-') or
                subject_str.startswith('2nd & 4th Sat-PD-')
               ):
                continue
            
            subject_division_map[subject].append(division)
        
        sorted_subjects = sorted(subject_division_map.keys())
        for subject in subject_division_map:
            subject_division_map[subject].sort()

        return jsonify({
            "subjects": sorted_subjects,
            "subject_division_map": subject_division_map
        })

    except Exception as e:
        print(f"Error in /get_admin_data: {e}")
        return jsonify({"error": "Could not load admin data."}), 500
    finally:
        if conn:
            conn.close()


@app.route('/get_schedule', methods=['POST'])
def get_schedule():
    mis_number = request.form.get('mis_number')
    if not mis_number:
        return jsonify({"error": "MIS number is required."})

    conn = None 
    try:
        conn = get_db_connection()
        
        student_info = conn.execute(
            'SELECT full_name, branch FROM student_divisions WHERE mis_number = ? LIMIT 1',
            (mis_number,)
        ).fetchone()

        if not student_info:
            return jsonify({"error": f"No student found with MIS number {mis_number}."})

        # --- THIS IS THE UPDATED LOGIC ---
        # Get all of the student's (subject, division) pairs
        student_data_rows = conn.execute(
            'SELECT DISTINCT division, subject FROM student_divisions WHERE mis_number = ?',
            (mis_number,)
        ).fetchall()
        
        # This will be a list of objects, e.g.,
        # [{subject: "Linear Algebra", division: "Division 4"}, {subject: "Engg Physics", division: "Division 7"}]
        student_subject_map = [dict(row) for row in student_data_rows]
        
        # Create the simple list of unique subjects for the Firestore query
        student_subjects = list(set(row['subject'] for row in student_data_rows))
        # --- END OF UPDATED LOGIC ---


        # (Schedule and grid logic is unchanged)
        schedule_query = """
            SELECT DISTINCT t.day, t.time, t.room, t.division, t.subject
            FROM timetables AS t
            JOIN student_divisions AS s ON t.division = s.division AND t.subject = s.subject
            WHERE s.mis_number = ?
        """
        schedule_data = conn.execute(schedule_query, (mis_number,)).fetchall()
        days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        full_time_slots = [
            '08:30 - 09:30', '09:30 - 10:30', '10:30 - 11:30', '11:30 - 12:30',
            '12:30 - 01:30', '01:30 - 02:30', '02:30 - 03:30', '03:30 - 04:30',
            '04:30 - 05:30', '05:30 - 06:30'
        ]
        grid = {time: {day: None for day in days_order} for time in full_time_slots}
        def normalize_time(t): return t.replace('-', ' - ').strip()
        def normalize_day(d): return d.capitalize()
        for row in schedule_data:
            time_key = normalize_time(row['time'])
            day_key = normalize_day(row['day'])
            if time_key in grid and day_key in grid[time_key]:
                grid[time_key][day_key] = dict(row)

        return jsonify({
            "student_name": student_info['full_name'],
            "branch": student_info['branch'],
            "schedule": {
                "days": days_order,
                "time_slots": full_time_slots,
                "grid": grid
            },
            # --- UPDATED DATA SENT TO BROWSER ---
            "student_data": { 
                "subject_map": student_subject_map, # The list of {subject, division} pairs
                "subjects_list": student_subjects   # The simple list of subjects
            }
        })
    
    except Exception as e:
        print(f"An error occurred: {e}") 
        return jsonify({"error": "An internal server error occurred."})
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)