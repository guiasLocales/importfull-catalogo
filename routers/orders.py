from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import io
import csv

from db_conn import get_db
from routers.auth import get_current_user
from schemas import (
    OrderMetricResponse, 
    OrderListResponse, 
    OrderListItem, 
    OrderChartItem, 
    TopStatsResponse,
    TopProductItem,
    TopCategoryItem
)

router = APIRouter(
    prefix="/api/orders",
    tags=["orders"],
    dependencies=[Depends(get_current_user)]
)

def build_filter_clause_and_params(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    condition_item: Optional[str] = None,
    status: Optional[str] = None,
    category_id: Optional[str] = None,
    search: Optional[str] = None
):
    clauses = []
    params = {}
    
    if start_date:
        clauses.append("created_at >= :start_date")
        params["start_date"] = f"{start_date} 00:00:00"
    if end_date:
        clauses.append("created_at <= :end_date")
        params["end_date"] = f"{end_date} 23:59:59"
    if condition_item:
        clauses.append("condition_item = :condition_item")
        params["condition_item"] = condition_item
    if status:
        clauses.append("status = :status")
        params["status"] = status
    if category_id:
        clauses.append("category_id = :category_id")
        params["category_id"] = category_id
    if search:
        clauses.append("(title LIKE :search OR venta_id LIKE :search OR item_id LIKE :search OR pack_id LIKE :search)")
        params["search"] = f"%{search}%"
        
    filter_clause = ""
    if clauses:
        filter_clause = " AND " + " AND ".join(clauses)
        
    return filter_clause, params

@router.get("/metrics", response_model=OrderMetricResponse)
def get_order_metrics(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    condition_item: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get summarized KPIs (Revenue, Fees, Units, Count, AOV) for MercadoLibre sales."""
    filter_clause, params = build_filter_clause_and_params(start_date, end_date, condition_item, status, category_id, search)
    
    sql = text(f"""
        SELECT 
            COUNT(DISTINCT venta_id) as total_sales_count,
            COALESCE(SUM(quantity), 0) as total_units_sold,
            COALESCE(SUM(gross_price), 0) as total_gross_income,
            COALESCE(SUM(sale_fee), 0) as total_fee
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
    """)
    
    try:
        row = db.execute(sql, params).first()
        if not row:
            return OrderMetricResponse(
                total_sales_count=0,
                total_units_sold=0.0,
                total_gross_income=0.0,
                total_fee=0.0,
                total_net_income=0.0,
                average_order_value=0.0
            )
        
        sales_count = int(row.total_sales_count or 0)
        units_sold = float(row.total_units_sold or 0.0)
        gross_income = float(row.total_gross_income or 0.0)
        fee = float(row.total_fee or 0.0)
        net_income = gross_income - fee
        aov = (gross_income / sales_count) if sales_count > 0 else 0.0
        
        return OrderMetricResponse(
            total_sales_count=sales_count,
            total_units_sold=units_sold,
            total_gross_income=gross_income,
            total_fee=fee,
            total_net_income=net_income,
            average_order_value=aov
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/list", response_model=OrderListResponse)
def get_orders_list(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    condition_item: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get paginated list of sales orders with filtering."""
    filter_clause, params = build_filter_clause_and_params(start_date, end_date, condition_item, status, category_id, search)
    
    count_sql = text(f"SELECT COUNT(*) FROM mercadolibre.v_orders_for_metrics WHERE 1=1 {filter_clause}")
    
    list_sql = text(f"""
        SELECT venta_id, pack_id, created_at, updated_at, status, item_id, title, category_id, condition_item, quantity, unit_price, gross_price, sale_fee, currency_id
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    try:
        total = db.execute(count_sql, params).scalar() or 0
        
        list_params = {**params, "limit": limit, "offset": offset}
        result = db.execute(list_sql, list_params).fetchall()
        
        orders = []
        for r in result:
            orders.append(OrderListItem(
                venta_id=r.venta_id,
                pack_id=r.pack_id,
                created_at=r.created_at,
                updated_at=r.updated_at,
                status=r.status,
                item_id=r.item_id,
                title=r.title,
                category_id=r.category_id,
                condition_item=r.condition_item,
                quantity=float(r.quantity or 0.0),
                unit_price=float(r.unit_price or 0.0),
                gross_price=float(r.gross_price or 0.0),
                sale_fee=float(r.sale_fee or 0.0),
                currency_id=r.currency_id
            ))
            
        return OrderListResponse(total=total, orders=orders)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/chart-data", response_model=List[OrderChartItem])
def get_chart_data(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    condition_item: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get aggregated daily statistics for Chart.js sales graph."""
    filter_clause, params = build_filter_clause_and_params(start_date, end_date, condition_item, status, category_id, search)
    
    sql = text(f"""
        SELECT 
            DATE(created_at) as sales_date,
            SUM(gross_price) as revenue,
            COUNT(DISTINCT venta_id) as orders_count,
            SUM(quantity) as quantity
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
        GROUP BY DATE(created_at)
        ORDER BY sales_date ASC
    """)
    
    try:
        result = db.execute(sql, params).fetchall()
        
        chart_data = []
        for r in result:
            chart_data.append(OrderChartItem(
                date=str(r.sales_date),
                revenue=float(r.revenue or 0.0),
                orders_count=int(r.orders_count or 0),
                quantity=float(r.quantity or 0.0)
            ))
            
        return chart_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/top-stats", response_model=TopStatsResponse)
def get_top_stats(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    condition_item: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get top 5 products and top 5 categories."""
    filter_clause, params = build_filter_clause_and_params(start_date, end_date, condition_item, status, category_id, search)
    
    products_sql = text(f"""
        SELECT 
            title,
            item_id,
            SUM(quantity) as quantity,
            SUM(gross_price) as revenue
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
        GROUP BY title, item_id
        ORDER BY revenue DESC
        LIMIT 5
    """)
    
    categories_sql = text(f"""
        SELECT 
            category_id,
            SUM(gross_price) as revenue
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
        GROUP BY category_id
        ORDER BY revenue DESC
        LIMIT 5
    """)
    
    try:
        prod_rows = db.execute(products_sql, params).fetchall()
        cat_rows = db.execute(categories_sql, params).fetchall()
        
        top_products = [
            TopProductItem(
                title=r.title,
                item_id=r.item_id,
                quantity=float(r.quantity or 0.0),
                revenue=float(r.revenue or 0.0)
            ) for r in prod_rows
        ]
        
        top_categories = [
            TopCategoryItem(
                category_id=r.category_id,
                revenue=float(r.revenue or 0.0)
            ) for r in cat_rows
        ]
        
        return TopStatsResponse(top_products=top_products, top_categories=top_categories)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/categories", response_model=List[str])
def get_order_categories(db: Session = Depends(get_db)):
    """Get list of distinct categories that have sales orders."""
    try:
        sql = text("SELECT DISTINCT category_id FROM mercadolibre.v_orders_for_metrics WHERE category_id IS NOT NULL AND category_id != '' ORDER BY category_id ASC")
        rows = db.execute(sql).fetchall()
        return [r[0] for r in rows if r[0]]
    except Exception as e:
        return []

@router.get("/statuses", response_model=List[str])
def get_order_statuses(db: Session = Depends(get_db)):
    """Get list of distinct order statuses."""
    try:
        sql = text("SELECT DISTINCT status FROM mercadolibre.v_orders_for_metrics WHERE status IS NOT NULL AND status != '' ORDER BY status ASC")
        rows = db.execute(sql).fetchall()
        return [r[0] for r in rows if r[0]]
    except Exception as e:
        return []

@router.get("/export-csv")
def export_orders_csv(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    condition_item: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Export filtered orders as CSV with UTF-8 BOM for Microsoft Excel."""
    filter_clause, params = build_filter_clause_and_params(start_date, end_date, condition_item, status, category_id, search)
    sql = text(f"""
        SELECT venta_id, pack_id, created_at, updated_at, status, item_id, title, category_id, condition_item, quantity, unit_price, gross_price, sale_fee, currency_id
        FROM mercadolibre.v_orders_for_metrics
        WHERE 1=1 {filter_clause}
        ORDER BY created_at DESC
    """)
    
    result = db.execute(sql, params).fetchall()
    
    output = io.StringIO()
    # UTF-8 BOM
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';')
    writer.writerow([
        "ID Venta", "ID Pack", "Fecha Creacion", "Fecha Actualizacion", "Estado",
        "Item ID", "Titulo", "Categoria", "Condicion", "Unidades",
        "Precio Unitario", "Monto Bruto", "Comision ML", "Monto Neto", "Moneda"
    ])
    
    for r in result:
        gross = float(r.gross_price or 0.0)
        fee = float(r.sale_fee or 0.0)
        net = gross - fee
        writer.writerow([
            r.venta_id or '',
            r.pack_id or '',
            str(r.created_at) if r.created_at else '',
            str(r.updated_at) if r.updated_at else '',
            r.status or '',
            r.item_id or '',
            r.title or '',
            r.category_id or '',
            r.condition_item or '',
            float(r.quantity or 0.0),
            float(r.unit_price or 0.0),
            gross,
            fee,
            net,
            r.currency_id or 'ARS'
        ])
        
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=ventas_mercadolibre.csv"}
    )

