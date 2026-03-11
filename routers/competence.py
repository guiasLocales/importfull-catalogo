from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db_conn import get_db
from routers.auth import get_current_user
import crud
import schemas
from schemas import CompetenceCreate, CompetenceUpdate, CompetenceResponse, CompetenceListResponse
from typing import Optional

router = APIRouter(
    prefix="/api/competence",
    tags=["competence-v121-fixed"],
    dependencies=[Depends(get_current_user)]
)

WEBHOOK_SCRAPPING_URL = "https://service--import-meli-competence-scrapper-402745694567.us-central1.run.app/webhooks/start_scrapping"
WEBHOOK_SECRET = "mati-gordo"

import httpx


@router.get("/debug-permissions")
def debug_permissions(db: Session = Depends(get_db)):
    """Debug endpoint to check current user permissions."""
    from sqlalchemy import text
    try:
        user_result = db.execute(text("SELECT CURRENT_USER()")).scalar()
        
        # MySQL specific command to show grants
        grants_result = db.execute(text("SHOW GRANTS FOR CURRENT_USER()"))
        grants = [row[0] for row in grants_result]
        
        return {
            "status": "success",
            "current_user": user_result,
            "grants": grants
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

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

@router.get("", response_model=CompetenceListResponse)
def list_competence(
    q: str = Query(None, description="Search query"),
    status: str = Query(None, description="Filter by status"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all competence scraping entries."""
    try:
        data = crud.get_competence_items(db, skip=skip, limit=limit, search=q, status=status)
        return CompetenceListResponse.model_validate(data)
    except Exception as e:
        print(f"Error listing competence items: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")

@router.get("/item", response_model=CompetenceResponse)
def get_competence_item(url: str, db: Session = Depends(get_db)):
    """Get a single competence item by URL."""
    item = crud.get_competence_item(db, url)
    if not item:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return CompetenceResponse.model_validate(item)

@router.patch("/item", response_model=CompetenceResponse)
def update_competence_item(url: str, updates: CompetenceUpdate, db: Session = Depends(get_db)):
    """Update a competence item by URL."""
    item = crud.get_competence_item(db, url)
    if not item:
        raise HTTPException(status_code=404, detail="Competence item not found")
    
    # Update fields
    update_data = updates.model_dump(exclude_unset=True)
    
    # We need to use the existing values if not provided in updates
    selling_price = update_data.get('selling_price', float(item.selling_price or 0))
    product_cost = update_data.get('product_cost', float(item.product_cost or 0))
    ml_comm_pct = update_data.get('ml_commision_percentage', float(item.ml_commision_percentage or 0))
    est_ret_pct = update_data.get('estimated_returns_percentage', float(item.estimated_returns_percentage or 0))
    
    ship_cost = update_data.get('shipping_cost', float(item.shipping_cost or 0))
    pack_cost = update_data.get('packaging_cost', float(item.packaging_cost or 0))
    adv_cost = update_data.get('advertising_cost', float(item.advertising_cost or 0))
    taxes = update_data.get('withholdings_gross_income_tax', float(item.withholdings_gross_income_tax or 0))
    fin_cost = update_data.get('financial_cost', float(item.financial_cost or 0))

    # Calculate
    ml_comm = selling_price * (ml_comm_pct / 100)
    ret_cost = selling_price * (est_ret_pct / 100)
    
    total = product_cost + ml_comm + ship_cost + pack_cost + adv_cost + ret_cost + taxes + fin_cost
    profit = selling_price - total
    
    margin = profit / selling_price if selling_price > 0 else 0
    markup = profit / product_cost if product_cost > 0 else 0

    update_data['ml_commision'] = ml_comm
    update_data['returns_cost'] = ret_cost
    update_data['total_costs'] = total
    update_data['net_profit'] = profit
    update_data['net_margin_percentage'] = margin * 100 # Store as 0-100 for consistency if requested or fix UI
    update_data['markup_percentage'] = markup * 100

    for key, value in update_data.items():
        setattr(item, key, value)
    
    db.commit()
    db.refresh(item)
    return CompetenceResponse.model_validate(item)


@router.post("")
def create_competence(request: CompetenceCreate, db: Session = Depends(get_db)):
    """Create a new competence entry. Only the catalog_link is required from the frontend."""
    if not request.catalog_link or not request.catalog_link.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Clean URL
    catalog_link = request.catalog_link.strip()
    
    try:
        item = crud.create_competence_item(
            db, 
            url=catalog_link,
            product_code=request.product_code,
            product_name=request.product_name
        )
        return CompetenceResponse.model_validate(item)
    except Exception as e:
        print(f"Error creating competence item: {e}")
        # Return the specific database error to the user for debugging
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")


@router.delete("")
def delete_competence(code: str = Query(..., description="Product code of the item to delete"), db: Session = Depends(get_db)):
    """Delete a competence entry by product code."""
    if not code:
        raise HTTPException(status_code=400, detail="Product code is required")
        
    success = crud.delete_competence_item(db, code)
    if not success:
        raise HTTPException(status_code=404, detail="Competence item not found")
    return {"status": "deleted", "product_code": code}

@router.post("/start-scraping")
def start_scraping(db: Session = Depends(get_db)):
    """Trigger global competence scraping via webhook."""
    data = {
        "secret": WEBHOOK_SECRET
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(WEBHOOK_SCRAPPING_URL, json=data)
            print(f"Scraping webhook sent. Status: {response.status_code}")
            
            if not (200 <= response.status_code < 300):
                raise HTTPException(status_code=500, detail=f"Webhook failed with status {response.status_code}")
                
            return {"status": "success", "message": "Scraping started"}
    except Exception as e:
        print(f"Error sending scraping webhook: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to trigger scraping: {str(e)}")
