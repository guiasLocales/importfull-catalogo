import sys
import os

print("DEBUG: Starting main.py", file=sys.stderr)

try:
    from fastapi import FastAPI, Depends
    from fastapi.middleware.cors import CORSMiddleware
    print("DEBUG: Imported fastapi", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import fastapi: {e}", file=sys.stderr)
    raise

try:
    from db_conn import engine, Base, SessionLocal, get_db, DB_HOST, INSTANCE_CONNECTION_NAME, DB_NAME, DB_USER
    print("DEBUG: Imported db_conn", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import db_conn: {e}", file=sys.stderr)
    # Print db_conn.py content for debugging if possible, or just the error
    raise

try:
    from routers import products, metadata, auth, competence, prompts, drive_auth, selling, performance
    print("DEBUG: Imported routers", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import routers: {e}", file=sys.stderr)
    raise

try:
    import uvicorn
    print("DEBUG: Imported uvicorn", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import uvicorn: {e}", file=sys.stderr)
    raise

try:
    import crud, schemas
    print("DEBUG: Imported crud/schemas", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import crud/schemas: {e}", file=sys.stderr)
    raise

from sqlalchemy import text
from sqlalchemy.orm import Session

# Include routers
app = FastAPI(
    title="Inventory API",
    description="REST API for managing inventory products on Google Cloud SQL",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(products.router)
app.include_router(metadata.router)
app.include_router(auth.router)
app.include_router(competence.router)
app.include_router(prompts.router)
app.include_router(drive_auth.router)
app.include_router(selling.router)
app.include_router(performance.router)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Create static directory if not exists
if not os.path.exists("static"):
    os.makedirs("static")

# Mount static files ONLY at /static path (not root)
app.mount("/static", StaticFiles(directory="static"), name="static_dir")

from db_conn import connection_errors

@app.get("/api/db-errors")
def get_db_errors():
    return {"connection_errors": connection_errors}

# --- Diagnostic Content ---
@app.get("/api/db-status")
def db_status(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "connected",
            "host": DB_HOST,
            "instance": INSTANCE_CONNECTION_NAME,
            "db": DB_NAME,
            "user": DB_USER
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "host": DB_HOST,
            "instance": INSTANCE_CONNECTION_NAME,
            "db": DB_NAME
        }

@app.get("/api/test-db-query")
def test_db_query(query: str = "SELECT 1", db: Session = Depends(get_db)):
    try:
        result = db.execute(text(query)).fetchall()
        return {"status": "success", "rows": [dict(row._mapping) for row in result]}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/db-check")
def db_check():
    """TEMPORARY: Public diagnostic endpoint to check database tables."""
    from sqlalchemy import text
    from db_conn import SessionLocal
    results = {}
    try:
        db = SessionLocal()
        # Check which DB we're connected to
        results["current_db"] = db.execute(text("SELECT DATABASE()")).scalar()
        
        # Show tables in current DB
        tables = [row[0] for row in db.execute(text("SHOW TABLES"))]
        results["tables_in_current_db"] = tables
        
        # Check if product_catalog_sync exists and count
        if "product_catalog_sync" in tables:
            count = db.execute(text("SELECT COUNT(*) FROM product_catalog_sync")).scalar()
            results["product_catalog_sync_count"] = count
            cols = [row[0] for row in db.execute(text("SHOW COLUMNS FROM product_catalog_sync"))]
            results["product_catalog_sync_columns"] = cols
            # Check meli products
            meli_count = db.execute(text("SELECT COUNT(*) FROM product_catalog_sync WHERE meli_id IS NOT NULL AND meli_id != ''")).scalar()
            results["products_with_meli_id"] = meli_count
            # Sample meli_ids
            if meli_count > 0:
                sample = [row[0] for row in db.execute(text("SELECT meli_id FROM product_catalog_sync WHERE meli_id IS NOT NULL AND meli_id != '' LIMIT 5"))]
                results["sample_meli_ids"] = sample
            # Check statuses
            statuses = [{r[0]: r[1]} for r in db.execute(text("SELECT status, COUNT(*) FROM product_catalog_sync GROUP BY status"))]
            results["status_distribution"] = statuses
        else:
            results["product_catalog_sync_count"] = "TABLE NOT FOUND"
        
        # Check mercadolibre schema
        try:
            ml_tables = [row[0] for row in db.execute(text("SHOW TABLES IN mercadolibre"))]
            results["mercadolibre_tables"] = ml_tables
            
            if "scrapped_competence" in ml_tables:
                cols = [row[0] for row in db.execute(text("SHOW COLUMNS FROM mercadolibre.scrapped_competence"))]
                results["scrapped_competence_columns"] = cols
                count = db.execute(text("SELECT COUNT(*) FROM mercadolibre.scrapped_competence")).scalar()
                results["scrapped_competence_count"] = count
        except Exception as e:
            results["mercadolibre_error"] = str(e)
            
        db.close()
    except Exception as e:
        results["error"] = str(e)
    return results


@app.on_event("startup")
def create_default_user():
    """Create default admin user on startup if it doesn't exist"""
    # Create default user
    try:
        db = SessionLocal()
        user = crud.get_user_by_username(db, username="admin")
        if not user:
            print("Creating default user 'admin'...")
            crud.create_user(db, schemas.UserCreate(username="admin", password="admin123"))
        else:
            print("Default user 'admin' already exists.")
        db.close()
    except Exception as e:
        print(f"Error creating default user: {e}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    # Disable reload for production stability
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
