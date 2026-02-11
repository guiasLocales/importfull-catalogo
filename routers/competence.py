from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db_conn import get_db
from routers.auth import get_current_user
import crud
from schemas import CompetenceCreate, CompetenceUpdate
from typing import Optional

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
        # Try DESCRIBE for MySQL - useful for debugging 500 errors
        result = db.execute(text("DESCRIBE mercadolibre.scrapped_competence"))
        columns = [{"Field": row[0], "Type": row[1], "Null": row[2], "Key": row[3]} for row in result]
        return {"status": "success", "columns": columns}
    except Exception as e:
        return {"status": "error", "message": str(e), "hint": "Table might not exist or user lacks SELECT permissions"}

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


@router.post("")
def create_competence(request: CompetenceCreate, db: Session = Depends(get_db)):
    """Create a new competence entry. Only the URL is required from the frontend."""
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Clean URL
    url = request.url.strip()
    
    try:
        item = crud.create_competence_item(
            db, 
            url=url,
            product_code=request.product_code,
            product_name=request.product_name
        )
        return item
    except Exception as e:
        print(f"Error creating competence item: {e}")
        # Return the specific database error to the user for debugging
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")


@router.delete("")
def delete_competence(url: str = Query(..., description="URL of the item to delete"), db: Session = Depends(get_db)):
    """Delete a competence entry by URL."""
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    success = crud.delete_competence_item(db, url)
    if not success:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return {"status": "deleted", "url": url}
