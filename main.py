import sys
import os

print("DEBUG: Starting main.py", file=sys.stderr)

try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    print("DEBUG: Imported fastapi", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import fastapi: {e}", file=sys.stderr)
    raise

try:
    from db_conn import engine, Base, SessionLocal
    print("DEBUG: Imported db_conn", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to import db_conn: {e}", file=sys.stderr)
    # Print db_conn.py content for debugging if possible, or just the error
    raise

try:
    from routers import products, metadata, auth
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

# Try to create tables, but don't crash if permissions are denied
# try:
#     Base.metadata.create_all(bind=engine)
# except Exception as e:
#     print(f"Warning: Could not create all tables: {e}")
#     print("Continuing with existing tables...")

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

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Create static directory if not exists
if not os.path.exists("static"):
    os.makedirs("static")

# Mount static files ONLY at /static path (not root)
app.mount("/static", StaticFiles(directory="static"), name="static_dir")

# Explicit route for root - serve index.html
@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.on_event("startup")
def create_default_user():
    """Create default admin user on startup if it doesn't exist"""
    # Run database migrations first
    try:
        import auto_migrate
        auto_migrate.run_migrations()
    except Exception as e:
        print(f"Migration warning: {e}")
    
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
