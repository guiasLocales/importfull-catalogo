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

    # 3. New attributes columns
    try:
        db = SessionLocal()
        print("Checking for new columns in 'mercadolibre.attributes'...")
        
        # Define all attribute columns to check
        columns_to_check = [
            'name', 'name_required', 'iron_type', 'iron_type_required', 
            'input_connector', 'input_connector_required',
            'thermal_container_type', 'thermal_container_type_required',
            'is_factory_kit', 'is_factory_kit_required',
            'pieces_number', 'pieces_number_required',
            'material', 'material_required',
            'drinking_glass_product_type', 'drinking_glass_product_type_required',
            'makeup_format', 'makeup_format_required',
            'eyeliner_type', 'eyeliner_type_required',
            'backpack_type', 'backpack_type_required'
        ]
        
        # Format list for SQL query
        cols_formatted = ", ".join([f"'{c}'" for c in columns_to_check])
        
        result = db.execute(text(f"""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'mercadolibre' 
            AND TABLE_NAME = 'attributes'
            AND COLUMN_NAME IN ({cols_formatted})
        """))
        existing_attr_cols = {row[0] for row in result}
        
        # Simple migrations using helper list
        new_cols_definitions = [
            ("name", "VARCHAR(255)"),
            ("name_required", "INT DEFAULT 0"),
            ("iron_type", "VARCHAR(100)"),
            ("iron_type_required", "INT DEFAULT 0"),
            ("input_connector", "VARCHAR(255)"),
            ("input_connector_required", "INT DEFAULT 0"),
            ("thermal_container_type", "VARCHAR(255)"),
            ("thermal_container_type_required", "INT DEFAULT 0"),
            ("is_factory_kit", "VARCHAR(50)"),
            ("is_factory_kit_required", "INT DEFAULT 0"),
            ("pieces_number", "INT"),
            ("pieces_number_required", "INT DEFAULT 0"),
            ("material", "VARCHAR(255)"),
            ("material_required", "INT DEFAULT 0"),
            ("drinking_glass_product_type", "VARCHAR(255)"),
            ("drinking_glass_product_type_required", "INT DEFAULT 0"),
            ("makeup_format", "VARCHAR(255)"),
            ("makeup_format_required", "INT DEFAULT 0"),
            ("eyeliner_type", "VARCHAR(255)"),
            ("eyeliner_type_required", "INT DEFAULT 0"),
            ("backpack_type", "VARCHAR(255)"),
            ("backpack_type_required", "INT DEFAULT 0")
        ]
        
        for col_name, col_type in new_cols_definitions:
            if col_name not in existing_attr_cols:
                print(f"Auto-migration: Adding {col_name} column to mercadolibre.attributes...")
                db.execute(text(f"ALTER TABLE mercadolibre.attributes ADD COLUMN {col_name} {col_type}"))
                db.commit()
                print(f"[OK] Added {col_name} column")
            
        db.close()
        print("[OK] Attributes migrations completed")
        return True
    except Exception as e:
        print(f"Attributes migration error: {e}")
        return False

if __name__ == "__main__":
    run_migrations()
