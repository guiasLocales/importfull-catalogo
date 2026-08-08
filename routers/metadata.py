from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from db_conn import get_db
import crud

router = APIRouter(
    prefix="/api",
    tags=["metadata"]
)

@router.get("/categories", response_model=List[Optional[str]])
def read_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@router.get("/brands", response_model=List[Optional[str]])
def read_brands(db: Session = Depends(get_db)):
    return crud.get_brands(db)

@router.get("/catalog-products")
def read_catalog_products(category: Optional[str] = None, search: Optional[str] = None, db: Session = Depends(get_db)):
    """Public catalog products endpoint fetching price column as local_price"""
    try:
        sql = "SELECT id, product_code, product_name, price AS local_price, product_image_b_format_url, product_type_path, stock, description, brand FROM product_catalog_sync WHERE 1=1"
        params = {}
        if category:
            sql += " AND LOWER(product_type_path) LIKE LOWER(:category)"
            params["category"] = f"%{category}%"
        if search:
            sql += " AND (LOWER(product_name) LIKE LOWER(:search) OR LOWER(product_code) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
        sql += " ORDER BY product_name ASC LIMIT 250"
        result = db.execute(text(sql), params).fetchall()
        return [dict(row._mapping) for row in result]
    except Exception as e:
        return []
