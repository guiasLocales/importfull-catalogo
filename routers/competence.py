from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db_conn import get_db
from routers.auth import get_current_user
import crud
from schemas import CompetenceCreate, CompetenceUpdate

router = APIRouter(
    prefix="/api/competence",
    tags=["competence"],
    dependencies=[Depends(get_current_user)]
)


@router.get("/debug-schema")
def debug_competence_schema(db: Session = Depends(get_db)):
    """Debug endpoint to inspect table columns since we cannot create tables."""
    from sqlalchemy import text
    try:
        # Try DESCRIBE for MySQL
        result = db.execute(text("DESCRIBE mercadolibre.scrapped_competence"))
        columns = [{"Field": row[0], "Type": row[1], "Null": row[2], "Key": row[3]} for row in result]
        return {"status": "success", "columns": columns}
    except Exception as e:
        return {"status": "error", "message": str(e), "hint": "Table might not exist or user lacks SELECT permissions"}

@router.post("/init-db")
def init_competence_db(db: Session = Depends(get_db)):
    """Initialize the competence table if it doesn't exist."""
    from sqlalchemy import text
    try:
        # Check if schema exists, create if not (might require high privileges)
        try:
             db.execute(text("CREATE SCHEMA IF NOT EXISTS mercadolibre"))
        except Exception as e:
             print(f"Schema creation failed (might exist): {e}")

        # Create table directly
        db.execute(text("""
        CREATE TABLE IF NOT EXISTS mercadolibre.scrapped_competence (
            id INT AUTO_INCREMENT PRIMARY KEY,
            meli_id VARCHAR(50),
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
            product_name VARCHAR(500),
            INDEX ix_mercadolibre_scrapped_competence_meli_id (meli_id)
        )
        """))
        db.commit()
        return {"status": "success", "message": "Table checked/created"}
    except Exception as e:
        print(f"Error initializing DB: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
def list_competence(
    q: str = Query(None, description="Search query"),
    status: str = Query(None, description="Filter by status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all competence scraping entries."""
    return crud.get_competence_items(db, skip=skip, limit=limit, search=q, status=status)


@router.get("/{item_id}")
def get_competence(item_id: int, db: Session = Depends(get_db)):
    """Get a single competence entry by ID."""
    item = crud.get_competence_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return item


@router.post("")
def create_competence(request: CompetenceCreate, db: Session = Depends(get_db)):
    """Create a new competence entry. Only the URL is required from the frontend."""
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    
    item = crud.create_competence_item(
        db, 
        url=request.url.strip(),
        product_code=request.product_code,
        product_name=request.product_name
    )
    return item


@router.patch("/{item_id}")
def update_competence(item_id: int, request: CompetenceUpdate, db: Session = Depends(get_db)):
    """Update a competence entry (only URL is editable from frontend)."""
    updates = request.dict(exclude_unset=True)
    item = crud.update_competence_item(db, item_id, updates)
    if not item:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return item


@router.delete("/{item_id}")
def delete_competence(item_id: int, db: Session = Depends(get_db)):
    """Delete a competence entry."""
    success = crud.delete_competence_item(db, item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return {"status": "deleted", "id": item_id}
