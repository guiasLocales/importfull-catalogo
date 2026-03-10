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

    # --- Migration: Drop meli_id from scrapped_competence (User Request) ---
    try:
        db = SessionLocal()
        # Check if column exists in mercadolibre.scrapped_competence
        print("Checking for 'meli_id' in 'mercadolibre.scrapped_competence'...")
        
        # MySQL specific: Check information_schema
        result = db.execute(text("""
            SELECT count(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'mercadolibre' 
            AND TABLE_NAME = 'scrapped_competence'
            AND COLUMN_NAME = 'meli_id'
        """))
        exists = result.scalar() > 0
        
        if exists:
            print("Found 'meli_id'. Dropping...")
            # Drop index first just in case
            try:
                db.execute(text("ALTER TABLE mercadolibre.scrapped_competence DROP INDEX ix_mercadolibre_scrapped_competence_meli_id"))
                print("Index dropped.")
            except Exception as e:
                print(f"Index drop note: {e}")
                
            db.execute(text("ALTER TABLE mercadolibre.scrapped_competence DROP COLUMN meli_id"))
            db.commit()
            print("Column 'meli_id' dropped successfully.")
        else:
            print("'meli_id' not found (already dropped).")
            
        db.close()
        return True

    except Exception as e:
        print(f"Competence migration error: {e}")
        return False

if __name__ == "__main__":
    run_migrations()
