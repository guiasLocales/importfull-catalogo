import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# FORCE UPDATE REF 4478

load_dotenv()

# Database credentials from environment variables
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "")
DB_HOST = os.getenv("DB_HOST", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Debug: print all connection variables (hide password)
print(f"DEBUG DB Config: DB_USER={DB_USER}, DB_NAME={DB_NAME}, DB_HOST={DB_HOST}")

engine = None

try:
    if DATABASE_URL:
        # Allow explicit override (e.g. for local SQLite)
        print(f"Using configured DATABASE_URL")
        engine = create_engine(
            DATABASE_URL, 
            connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
        )
    elif DB_HOST and DB_USER and DB_NAME:
        print(f"Connecting to MySQL via Public IP: {DB_HOST}")
        
        import ssl
        from urllib.parse import quote_plus
        
        # Create SSL context (Cloud SQL may require SSL)
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        # URL encode credentials to handle special chars
        content_user = quote_plus(DB_USER) if DB_USER else ""
        content_pass = quote_plus(DB_PASSWORD) if DB_PASSWORD else ""

        SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{content_user}:{content_pass}@{DB_HOST}/{DB_NAME}"
        
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={"ssl": ssl_ctx},
            pool_pre_ping=True,
            pool_recycle=300
        )
        print("Engine created for MySQL (Direct IP)")
    else:
        # No remote database configured, use local SQLite for development
        print("No DB_HOST or DATABASE_URL configured, using local SQLite")
        # Use relative path that works in any environment
        SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL, 
            connect_args={"check_same_thread": False}
        )
        print("Engine created for SQLite")

except Exception as e:
    print(f"Database engine creation error: {e}")
    print("Falling back to local SQLite database.")
    # Use relative path that works in any environment (Linux container or Windows)
    SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False}
    )

if engine is None:
    print("CRITICAL: No database engine created, using SQLite fallback")
    engine = create_engine("sqlite:///./inventory.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
