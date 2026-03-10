from sqlalchemy import create_engine, inspect, text
from db_conn import DATABASE_URL, DB_USER, DB_PASSWORD, DB_HOST, DB_NAME
import sys

print("--- Checking Competence Table ---")

# Construct URL explicitly if needed to DEBUG
if DB_HOST:
    from urllib.parse import quote_plus
    content_user = quote_plus(DB_USER) if DB_USER else ""
    content_pass = quote_plus(DB_PASSWORD) if DB_PASSWORD else ""
    url = f"mysql+pymysql://{content_user}:{content_pass}@{DB_HOST}/{DB_NAME}"
    print(f"Connecting to {DB_HOST}...")
else:
    url = "sqlite:///./inventory.db"
    print("Connecting to SQLite...")

try:
    engine = create_engine(url)
    connection = engine.connect()
    print("Connection successful.")
    
    # Check if schema 'mercadolibre' exists
    try:
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS mercadolibre"))
        print("Schema 'mercadolibre' ensured.")
    except Exception as e:
        print(f"Warning checking schema: {e}")

    # Check table
    inspector = inspect(engine)
    tables = inspector.get_table_names(schema='mercadolibre')
    print(f"Tables in 'mercadolibre' schema: {tables}")

    if 'scrapped_competence' not in tables:
        print("Table 'scrapped_competence' DOES NOT EXIST. Creating it...")
        
        create_table_sql = """
        CREATE TABLE mercadolibre.scrapped_competence (
            id INT AUTO_INCREMENT PRIMARY KEY,
            url TEXT,
            title VARCHAR(500),
            price DECIMAL(10, 2),
            competitor VARCHAR(255),
            price_in_installments VARCHAR(255),
            image TEXT,
            timestamp DATETIME,
            status VARCHAR(50),
            api_cost_total DECIMAL(10, 4),
            remaining_credits DECIMAL(10, 4),
            product_code VARCHAR(255),
            product_name VARCHAR(500)
        );
        """
        connection.execute(text(create_table_sql))
        print("Table 'mercadolibre.scrapped_competence' created successfully!")
    else:
        print("Table 'scrapped_competence' ALREADY EXISTS.")
        
    connection.close()
    print("--- Done ---")

except Exception as e:
    print(f"CRITICAL ERROR: {e}")
