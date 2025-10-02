import sqlite3
import csv
import os

DB_FILE = "schedule.db"
STUDENTS_CSV = "students.csv"
TIMETABLES_CSV = "timetables.csv"

# Delete the old database file if it exists, so we start fresh
if os.path.exists(DB_FILE):
    os.remove(DB_FILE)

def clean_text(text):
    """Removes leading/trailing spaces and collapses internal spaces."""
    return ' '.join(text.strip().split())

def setup_database():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Create the 'student_divisions' table with the new 'subject' column
    cursor.execute('''
    CREATE TABLE student_divisions (
        mis_number TEXT NOT NULL,
        full_name TEXT NOT NULL,
        branch TEXT NOT NULL,
        subject TEXT NOT NULL,
        division TEXT NOT NULL
    )
    ''')

    # Create the 'timetables' table with 'subject' instead of 'branch'
    cursor.execute('''
    CREATE TABLE timetables (
        subject TEXT NOT NULL,
        division TEXT NOT NULL,
        day TEXT NOT NULL,
        time TEXT NOT NULL,
        room TEXT NOT NULL
    )
    ''')

    # Load data from students.csv (now with 7 columns)
    with open(STUDENTS_CSV, 'r', newline='') as file:
        reader = csv.reader(file)
        header = next(reader) # Skip header
        for row in reader:
            mis, first, middle, last, branch, subject, division = row
            full_name = ' '.join(filter(None, [first, middle, last]))
            cursor.execute("INSERT INTO student_divisions VALUES (?, ?, ?, ?, ?)",
                           (mis, full_name, branch, clean_text(subject), clean_text(division)))

    # Load data from timetables.csv (now starts with Subject)
    with open(TIMETABLES_CSV, 'r', newline='') as file:
        reader = csv.reader(file)
        header = next(reader) # Skip header
        for row in reader:
            subject, division, day, time, room = row
            cursor.execute("INSERT INTO timetables VALUES (?, ?, ?, ?, ?)",
                           (clean_text(subject), clean_text(division), day.strip(), time.strip(), room.strip()))

    conn.commit()
    conn.close()
    print("Database setup complete! A file named schedule.db has been created. ✅")

if __name__ == "__main__":
    setup_database()