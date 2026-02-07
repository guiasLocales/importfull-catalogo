from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
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
