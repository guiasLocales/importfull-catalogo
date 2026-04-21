import os
import pymysql
from db_conn import DB_USER, DB_PASSWORD, DB_HOST, DB_NAME

print(f"Connecting to MySQL at {DB_HOST}...")

try:
    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME, # Default DB
        cursorclass=pymysql.cursors.DictCursor
    )
    with conn.cursor() as cursor:
        print("Checking if tienda_nube.attributes exists...")
        # In MySQL, schema is just another database. 
        # Ensure it exists or handle appropriately.
        
        print("Altering table tienda_nube.attributes columns...")
        # Note: In MySQL, the syntax is slightly different for ALTER COLUMN
        try:
            cursor.execute("ALTER TABLE tienda_nube.attributes MODIFY COLUMN seo_title VARCHAR(255)")
            cursor.execute("ALTER TABLE tienda_nube.attributes MODIFY COLUMN seo_description TEXT")
            cursor.execute("ALTER TABLE tienda_nube.attributes MODIFY COLUMN tags TEXT")
            cursor.execute("ALTER TABLE tienda_nube.attributes MODIFY COLUMN video_url VARCHAR(255)")
            conn.commit()
            print("Success!")
        except Exception as table_err:
            print(f"Table error (maybe database/table doesn't exist?): {table_err}")
            
    conn.close()
except Exception as e:
    print(f"Connection Error: {e}")
