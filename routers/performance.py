from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from db_conn import get_db
from models import Performance
from schemas import PerformanceResponse, PerformanceSummary, PerformanceRuleRow, PerformanceScoreItem
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

@router.get("/scores/bulk", response_model=List[PerformanceScoreItem])
def get_bulk_scores(meli_ids: str, db: Session = Depends(get_db)):
    """Fetch only the overall score/level for a list of meli_ids."""
    id_list = meli_ids.split(",")
    
    # Subquery to get one row per meli_id (the columns are denormalized anyway)
    # We use MAX(id) to get the latest row or any row for that meli_id
    subq = db.query(Performance.meli_id, Performance.overall_score, Performance.quality_level, Performance.level_wording) \
             .filter(Performance.meli_id.in_(id_list)) \
             .group_by(Performance.meli_id).all()
    
    return [
        PerformanceScoreItem(
            meli_id=row.meli_id,
            overall_score=row.overall_score,
            quality_level=row.quality_level,
            level_wording=row.level_wording
        ) for row in subq
    ]
