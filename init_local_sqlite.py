import sqlite3
import os
import bcrypt

def get_password_hash(password):
    # Standard bcrypt hashing (compatible with FastAPI/Passlib)
    # 12 rounds is the default for passlib/bcrypt
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def init_local_sqlite():
    db_path = "inventory.db"
    print(f"Initializing local database: {db_path}...")
    
    try:
        # Connect and ensure clean start if it was a directory or weird file
        if os.path.exists(db_path) and os.path.getsize(db_path) == 0:
            print("Cleaning up empty 0-byte file.")
            os.remove(db_path)
            
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Create inventory_users table
        print("Creating 'inventory_users' table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            logo_url TEXT,
            theme_pref TEXT DEFAULT 'light',
            logo_light_url TEXT,
            logo_dark_url TEXT
        )
        """)
        
        # 2. Add admin user
        print("Setting up 'admin' account...")
        hashed_pw = get_password_hash("admin123")
        try:
            cursor.execute(
                "INSERT INTO inventory_users (username, hashed_password, role) VALUES (?, ?, 'admin')",
                ("admin", hashed_pw)
            )
            print("✓ Admin user created (User: admin, Pass: admin123)")
        except sqlite3.IntegrityError:
            print("! Admin user already exists.")
            
        # 3. Create product_catalog_sync table
        print("Creating 'product_catalog_sync' table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_catalog_sync (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_code TEXT,
            product_name TEXT,
            price NUMERIC,
            stock INTEGER,
            drive_url TEXT,
            meli_id TEXT,
            status TEXT
        )
        """)
        
        conn.commit()
        conn.close()
        print("\n--- Local Initialization Complete ---")
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    init_local_sqlite()
