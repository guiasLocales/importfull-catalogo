from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db_conn import get_db
import models, schemas
from typing import List
import logging

router = APIRouter(
    prefix="/api/prompts",
    tags=["prompts"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[schemas.PromptResponse])
def get_prompts(db: Session = Depends(get_db)):
    try:
        prompts = db.query(models.Prompt).all()
        return prompts
    except Exception as e:
        logging.error(f"Error fetching prompts: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")

@router.patch("/{id}", response_model=schemas.PromptResponse)
def update_prompt(id: int, prompt_update: schemas.PromptUpdate, db: Session = Depends(get_db)):
    db_prompt = db.query(models.Prompt).filter(models.Prompt.id == id).first()
    if not db_prompt:
        raise HTTPException(status_code=404, detail="Prompt config not found")
    
    # Only update allowed fields
    if prompt_update.ai_general is not None:
        db_prompt.ai_general = prompt_update.ai_general
    if prompt_update.rules is not None:
        db_prompt.rules = prompt_update.rules
    if prompt_update.ai_improving_human_reply is not None:
        db_prompt.ai_improving_human_reply = prompt_update.ai_improving_human_reply
        
    db.commit()
    db.refresh(db_prompt)
    return db_prompt
