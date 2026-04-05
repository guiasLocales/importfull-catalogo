from sqlalchemy import text
from passlib.context import CryptContext
from db_conn import SessionLocal, engine
import sys

# Password hashing context (same as auth.py)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def init_db():
    """Create inventory_users table and add default admin user."""
    print("Connecting to database...", flush=True)
    try:
        db = SessionLocal()
        print("Session created.", flush=True)
        
        # 1. Create table if not exists
        print("Executing CREATE TABLE IF NOT EXISTS...", flush=True)
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS inventory_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'admin',
            logo_url VARCHAR(255),
            theme_pref VARCHAR(20) DEFAULT 'light',
            logo_light_url VARCHAR(255),
            logo_dark_url VARCHAR(255),
            INDEX (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        db.execute(text(create_table_sql))
        print("TABLE SQL executed. Committing...", flush=True)
        db.commit()
        print("✓ Table created or already exists.", flush=True)

        # 2. Check if admin user exists
        print("Checking for existing 'admin' user...", flush=True)
        result = db.execute(text("SELECT id FROM inventory_users WHERE username = 'admin'"))
        admin_exists = result.fetchone() is not None
        
        if not admin_exists:
            print("Creating default 'admin' user...", flush=True)
            hashed_pw = get_password_hash("admin123")
            db.execute(
                text("INSERT INTO inventory_users (username, hashed_password, role) VALUES (:u, :p, 'admin')"),
                {"u": "admin", "p": hashed_pw}
            )
            print("INSERT executed. Committing...", flush=True)
            db.commit()
            print("✓ Admin user created successfully (password: admin123).", flush=True)
        else:
            print("! Admin user already exists. Skipping creation.", flush=True)

        db.close()
        print("--- Initialization Complete ---", flush=True)
        return True

    except Exception as e:
        print(f"Error during initialization: {e}")
        return False

if __name__ == "__main__":
    init_db()
