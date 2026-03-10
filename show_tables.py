"""
Script to list all tables in the database
"""
from sqlalchemy import text, inspect
import db_conn

def list_tables():
    engine = db_conn.engine
    inspector = inspect(engine)
    
    print("=== TABLAS EN LA BASE DE DATOS ===\n")
    
    tables = inspector.get_table_names()
    for table in tables:
        print(f"📋 Tabla: {table}")
        columns = inspector.get_columns(table)
        print(f"   Columnas ({len(columns)})")
        # for col in columns:
        #    print(f"      - {col['name']} ({col['type']})")
        print()
    
    try:
        meli_tables = inspector.get_table_names(schema='mercadolibre')
        print("\n=== ESQUEMA: mercadolibre ===")
        for table in meli_tables:
            print(f"📋 Tabla: mercadolibre.{table}")
            columns = inspector.get_columns(table, schema='mercadolibre')
            print(f"   Columnas ({len(columns)})")
    except Exception as e:
        print(f"\nCould not access 'mercadolibre' schema: {e}")

if __name__ == "__main__":
    list_tables()
