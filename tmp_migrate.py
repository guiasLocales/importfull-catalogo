import sys
import os
from sqlalchemy import text

# Add current directory to path so we can import modules
sys.path.append(os.getcwd())

try:
    from db_conn import engine
    print(f"Connecting to: {engine.url.render_as_string(hide_password=True)}")
    
    with engine.connect() as conn:
        print("Checking for missing columns in mercadolibre.scrapped_competence...")
        
        # Check columns
        result = conn.execute(text("DESCRIBE mercadolibre.scrapped_competence"))
        existing_cols = [row[0] for row in result]
        print(f"Existing columns: {existing_cols}")
        
        needed_cols = [
            ("logistics_type", "VARCHAR(50)"),
            ("installments_plan", "VARCHAR(50)")
        ]
        
        for col_name, col_type in needed_cols:
            if col_name not in existing_cols:
                print(f"Adding column {col_name}...")
                conn.execute(text(f"ALTER TABLE mercadolibre.scrapped_competence ADD COLUMN {col_name} {col_type}"))
                print(f"Column {col_name} added.")
            else:
                print(f"Column {col_name} already exists.")
                
        conn.commit()
        print("Migration completed successfully.")

except Exception as e:
    print(f"Error during migration: {e}")
    sys.exit(1)
