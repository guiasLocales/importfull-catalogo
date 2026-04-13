from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import logging
import traceback

from db_conn import get_db
from models import Performance
from schemas import PerformanceResponse, PerformanceSummary, PerformanceRuleRow, PerformanceScoreItem
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/performance",
    tags=["performance"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/{meli_id}", response_model=PerformanceResponse)
def get_performance(meli_id: str, db: Session = Depends(get_db)):
    try:
        # Query all rows for this meli_id
        # We order by rule_status DESC so 'PENDING' comes before 'COMPLETED' (alphabetically P > C)
        rows_db = db.query(Performance).filter(
            Performance.meli_id == meli_id
        ).order_by(Performance.rule_status.desc(), Performance.bucket_title).all()

        if not rows_db:
            return PerformanceResponse(summary=None, rows=[])

        # Extract summary from the first row
        first = rows_db[0]
        summary = PerformanceSummary(
            meli_id=meli_id,
            quality_level=getattr(first, 'quality_level', None),
            overall_score=getattr(first, 'overall_score', None),
            level_wording=getattr(first, 'level_wording', None),
            item_calculated_at=getattr(first, 'item_calculated_at', None)
        )

        # Map to PerformanceRuleRow safely
        rows = []
        for r in rows_db:
            try:
                rows.append(PerformanceRuleRow.model_validate(r))
            except Exception as e:
                logger.warning(f"Error validating row {r.id}: {e}")
                # Continue with next row instead of crashing everything

        return PerformanceResponse(summary=summary, rows=rows)
    except Exception as e:
        logger.error(f"Error in get_performance for {meli_id}: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/scores/bulk", response_model=List[PerformanceScoreItem])
def get_bulk_scores(meli_ids: str, db: Session = Depends(get_db)):
    """Fetch only the overall score/level for a list of meli_ids."""
    try:
        id_list = meli_ids.split(",")
        
        # Fixed query: use group_by correctly with aggregations to avoid SQL errors
        subq = db.query(
            Performance.meli_id, 
            func.max(Performance.overall_score).label("overall_score"), 
            func.max(Performance.quality_level).label("quality_level"), 
            func.max(Performance.level_wording).label("level_wording")
        ).filter(Performance.meli_id.in_(id_list)) \
         .group_by(Performance.meli_id).all()
        
        return [
            PerformanceScoreItem(
                meli_id=row.meli_id,
                overall_score=row.overall_score,
                quality_level=row.quality_level,
                level_wording=row.level_wording
            ) for row in subq
        ]
    except Exception as e:
        logger.error(f"Error in get_bulk_scores: {e}")
        return [] # Return empty instead of 500ing the whole table
