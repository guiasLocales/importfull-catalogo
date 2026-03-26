import os
import ssl
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus
from dotenv import load_dotenv

# RENAMED from database.py to db_conn.py to force update
# REF 4525 - Hardcoded defaults for guias-locales-prod migration

load_dotenv()

# Database credentials with hardcoded defaults for the new instance
DB_USER = os.getenv("DB_USER", "leandro_guias")
DB_PASSWORD = os.getenv("DB_PASSWORD", "!39o.129mAacasu1048x$.")
DB_NAME = os.getenv("DB_NAME", "app_import")
DB_HOST = os.getenv("DB_HOST", "34.55.226.178")
DATABASE_URL = os.getenv("DATABASE_URL", "")
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "nicoservertest:us-central1:guias-locales-prod")

# Debug: print all connection variables (hide password)
print(f"DEBUG DB Config: USER={DB_USER}, DB={DB_NAME}, HOST={DB_HOST}, INSTANCE={INSTANCE_CONNECTION_NAME}")

engine = None

def create_mysql_engine(url, connect_args=None):
    return create_engine(
        url,
        connect_args=connect_args or {},
        pool_pre_ping=True,
        pool_recycle=300
    )

try:
    if DATABASE_URL:
        print(f"Attempting connection via DATABASE_URL")
        engine = create_engine(
            DATABASE_URL, 
            connect_args={"check_same_thread": False} if "sqlite" in str(DATABASE_URL) else {}
        )
    else:
        # Try Unix Socket first if in Cloud Run environment
        if INSTANCE_CONNECTION_NAME and DB_USER and DB_NAME:
            try:
                print(f"Attempting connection via Unix Socket: {INSTANCE_CONNECTION_NAME}")
                socket_path = f"/cloudsql/{INSTANCE_CONNECTION_NAME}"
                user_enc = quote_plus(DB_USER)
                pass_enc = quote_plus(DB_PASSWORD)
                url = f"mysql+pymysql://{user_enc}:{pass_enc}@/{DB_NAME}?unix_socket={socket_path}"
                
                test_engine = create_mysql_engine(url)
                # Test the connection immediately
                with test_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                engine = test_engine
                print("SUCCESS: Connected via Unix Socket")
            except Exception as socket_err:
                print(f"Unix Socket connection failed: {socket_err}")
                engine = None

        # Fallback to Public IP if socket failed or wasn't tried
        if engine is None and DB_HOST and DB_USER and DB_NAME:
            try:
                print(f"Attempting connection via Public IP: {DB_HOST}")
                ssl_ctx = ssl.create_default_context()
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE
                
                user_enc = quote_plus(DB_USER)
                pass_enc = quote_plus(DB_PASSWORD)
                url = f"mysql+pymysql://{user_enc}:{pass_enc}@{DB_HOST}/{DB_NAME}"
                
                test_engine = create_mysql_engine(url, connect_args={"ssl": ssl_ctx})
                with test_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                engine = test_engine
                print("SUCCESS: Connected via Public IP")
            except Exception as ip_err:
                print(f"Public IP connection failed: {ip_err}")
                engine = None

    # Final fallback to SQLite if all remote options failed
    if engine is None:
        print("Falling back to local SQLite database (inventory.db)")
        SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"
        engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
        print("Engine created for SQLite")

except Exception as e:
    print(f"Critical error in DB engine setup: {e}")
    SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
