"""
Auto-migration script that runs on Cloud Run startup
This adds the logo columns if they don't exist
"""

from sqlalchemy import text
from db_conn import SessionLocal

def run_migrations():
    """Run database migrations"""
    # 1. Logo columns in inventory_users
    try:
        db = SessionLocal()
        result = db.execute(text("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'inventory_users'
            AND COLUMN_NAME IN ('logo_light_url', 'logo_dark_url')
        """))
        existing_columns = {row[0] for row in result}
        
        if 'logo_light_url' not in existing_columns:
            print("Auto-migration: Adding logo_light_url column...")
            db.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_light_url VARCHAR(255)"))
            db.commit()
            print("[OK] Added logo_light_url column")
            
        if 'logo_dark_url' not in existing_columns:
            print("Auto-migration: Adding logo_dark_url column...")
            db.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_dark_url VARCHAR(255)"))
            db.commit()
            print("[OK] Added logo_dark_url column")
        
        db.close()
        print("[OK] Users migrations completed")
    except Exception as e:
        print(f"Users migration error: {e}")

    # 2. Drop meli_id from scrapped_competence
    try:
        db = SessionLocal()
        print("Checking for 'meli_id' in 'mercadolibre.scrapped_competence'...")
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
    except Exception as e:
        print(f"Competence migration error: {e}")

    # 3. New attributes columns: name, name_required, iron_type, iron_type_required, input_connector, input_connector_required
    try:
        db = SessionLocal()
        print("Checking for new columns in 'mercadolibre.attributes'...")
        result = db.execute(text("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'mercadolibre' 
            AND TABLE_NAME = 'attributes'
            AND COLUMN_NAME IN ('name', 'name_required', 'iron_type', 'iron_type_required', 'input_connector', 'input_connector_required')
        """))
        existing_attr_cols = {row[0] for row in result}
        
        if 'name' not in existing_attr_cols:
            print("Auto-migration: Adding name column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN name VARCHAR(255)"))
            db.commit()
            print("[OK] Added name column")
            
        if 'name_required' not in existing_attr_cols:
            print("Auto-migration: Adding name_required column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN name_required INT DEFAULT 0"))
            db.commit()
            print("[OK] Added name_required column")
            
        if 'iron_type' not in existing_attr_cols:
            print("Auto-migration: Adding iron_type column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN iron_type VARCHAR(100)"))
            db.commit()
            print("[OK] Added iron_type column")
            
        if 'iron_type_required' not in existing_attr_cols:
            print("Auto-migration: Adding iron_type_required column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN iron_type_required INT DEFAULT 0"))
            db.commit()
            print("[OK] Added iron_type_required column")

        if 'input_connector' not in existing_attr_cols:
            print("Auto-migration: Adding input_connector column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN input_connector VARCHAR(255)"))
            db.commit()
            print("[OK] Added input_connector column")

        if 'input_connector_required' not in existing_attr_cols:
            print("Auto-migration: Adding input_connector_required column to mercadolibre.attributes...")
            db.execute(text("ALTER TABLE mercadolibre.attributes ADD COLUMN input_connector_required INT DEFAULT 0"))
            db.commit()
            print("[OK] Added input_connector_required column")
            
        db.close()
        print("[OK] Attributes migrations completed")
        return True
    except Exception as e:
        print(f"Attributes migration error: {e}")
        return False

if __name__ == "__main__":
    run_migrations()
