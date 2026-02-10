"""
Auto-migration script that runs on Cloud Run startup
This adds the logo columns if they don't exist
"""

from sqlalchemy import text
from db_conn import SessionLocal

def run_migrations():
    """Run database migrations"""
    try:
        db = SessionLocal()
        
        # Check if columns exist
        result = db.execute(text("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'inventory_users'
            AND COLUMN_NAME IN ('logo_light_url', 'logo_dark_url')
        """))
        existing_columns = {row[0] for row in result}
        
        # Add missing columns
        if 'logo_light_url' not in existing_columns:
            print("Auto-migration: Adding logo_light_url column...")
            db.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_light_url VARCHAR(255)"))
            db.commit()
            print("✓ Added logo_light_url column")
            
        if 'logo_dark_url' not in existing_columns:
            print("Auto-migration: Adding logo_dark_url column...")
            db.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_dark_url VARCHAR(255)"))
            db.commit()
            print("✓ Added logo_dark_url column")
        
        db.close()
        print("✓ Migrations completed")
        return True
        
    except Exception as e:
        print(f"Migration error (may already be applied): {e}")
        return False

if __name__ == "__main__":
    run_migrations()
