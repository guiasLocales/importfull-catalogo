"""
Force creation of inventory_users table and columns
"""
from sqlalchemy import create_engine, text, Column, Integer, String
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import db_conn

Base = declarative_base()

class User(Base):
    __tablename__ = "inventory_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    role = Column(String(50), default="admin")
    logo_light_url = Column(String(255), nullable=True)
    logo_dark_url = Column(String(255), nullable=True)
    theme_pref = Column(String(20), default="light")

def init_db():
    print("Connecting to database...")
    engine = db_conn.engine
    
    # Create table
    print("Creating inventory_users table if not exists...")
    Base.metadata.create_all(bind=engine)
    print("✓ Table inventory_users checks out")
    
    # Verify columns manually (SQLAlchemy create_all doesn't update existing tables)
    with engine.connect() as conn:
        print("Verifying columns...")
        # Check for logo_light_url
        try:
            conn.execute(text("SELECT logo_light_url FROM inventory_users LIMIT 1"))
            print("✓ Column logo_light_url exists")
        except Exception:
            print("Adding logo_light_url column...")
            conn.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_light_url VARCHAR(255)"))
            print("✓ Added logo_light_url")
            
        # Check for logo_dark_url
        try:
            conn.execute(text("SELECT logo_dark_url FROM inventory_users LIMIT 1"))
            print("✓ Column logo_dark_url exists")
        except Exception:
            print("Adding logo_dark_url column...")
            conn.execute(text("ALTER TABLE inventory_users ADD COLUMN logo_dark_url VARCHAR(255)"))
            print("✓ Added logo_dark_url")
            
        conn.commit()
        
    print("\nSUCCESS: Database structure is ready for permanent logos.")

if __name__ == "__main__":
    init_db()
