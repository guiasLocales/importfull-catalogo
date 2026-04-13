from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from db_conn import get_db
from models import Performance
from schemas import PerformanceResponse, PerformanceSummary, PerformanceRuleRow
from routers.auth import get_current_user

router = APIRouter(
    prefix="/api/performance",
    tags=["performance"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/{meli_id}", response_model=PerformanceResponse)
def get_performance(meli_id: str, db: Session = Depends(get_db)):
    # Query all rows for this meli_id
    # We order by rule_status DESC so 'PENDING' comes before 'COMPLETED' (alphabetically P > C)
    rows_db = db.query(Performance).filter(
        Performance.meli_id == meli_id
    ).order_by(Performance.rule_status.desc(), Performance.bucket_title).all()

    if not rows_db:
        return PerformanceResponse(summary=None, rows=[])

    # Extract summary from the first row (these fields are denormalized and repeated)
    first = rows_db[0]
    summary = PerformanceSummary(
        meli_id=meli_id,
        quality_level=first.quality_level,
        overall_score=first.overall_score,
        level_wording=first.level_wording,
        item_calculated_at=first.item_calculated_at
    )

    # Map to PerformanceRuleRow
    rows = [PerformanceRuleRow.model_validate(r) for r in rows_db]

    return PerformanceResponse(summary=summary, rows=rows)
