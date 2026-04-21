import os
from sqlalchemy import create_engine, text
from db_conn import DB_USER, DB_PASSWORD, DB_HOST, DB_NAME

# Manually construct URL since we are running locally/standalone
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

print(f"Connecting to {DB_HOST}/{DB_NAME}...")
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        print("Altering table tienda_nube.attributes...")
        conn.execute(text("ALTER TABLE tienda_nube.attributes ALTER COLUMN seo_title TYPE varchar(255)"))
        conn.execute(text("ALTER TABLE tienda_nube.attributes ALTER COLUMN seo_description TYPE text"))
        conn.execute(text("ALTER TABLE tienda_nube.attributes ALTER COLUMN tags TYPE text"))
        conn.execute(text("ALTER TABLE tienda_nube.attributes ALTER COLUMN video_url TYPE varchar(255)"))
        conn.commit()
        print("Success!")
except Exception as e:
    print(f"Error: {e}")
