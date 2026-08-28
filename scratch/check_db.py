import sqlite3
import os
import json

db_path = 'data/medpulse.sqlite'
json_path = 'data/patients.json'
users_json_path = 'data/users.json'

print("--- Database Files Info ---")
for p in [db_path, json_path, users_json_path]:
    exists = os.path.exists(p)
    size = os.path.getsize(p) if exists else 0
    print(f"{p}: Exists={exists}, Size={size} bytes")

print("\n--- SQLite Connection Info ---")
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # List tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"Tables in SQLite: {tables}")
        
        # Info for each table
        for table in tables:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [c[1] for c in cursor.fetchall()]
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"Table '{table}': {count} rows. Columns: {columns}")
            
            # Print sample data (first 2 rows)
            cursor.execute(f"SELECT * FROM {table} LIMIT 2")
            rows = cursor.fetchall()
            print(f"  Sample rows:")
            for r in rows:
                # Truncate long representation for printing
                rep = str(r)
                if len(rep) > 200:
                    rep = rep[:200] + "..."
                print(f"    {rep}")
                
        conn.close()
    except Exception as e:
        print(f"Error querying SQLite: {e}")
else:
    print("SQLite file does not exist.")

print("\n--- JSON Fallback Info ---")
if os.path.exists(json_path):
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            patients = json.load(f)
        print(f"patients.json count: {len(patients)}")
        if patients:
            print("Latest patient ID in patients.json:", patients[0].get('id'), "Name:", patients[0].get('name'))
    except Exception as e:
        print(f"Error reading patients.json: {e}")

if os.path.exists(users_json_path):
    try:
        with open(users_json_path, 'r', encoding='utf-8') as f:
            users = json.load(f)
        print(f"users.json count: {len(users)}")
    except Exception as e:
        print(f"Error reading users.json: {e}")
