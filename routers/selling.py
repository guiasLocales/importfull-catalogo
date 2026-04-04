from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from db_conn import get_db
from routers.auth import get_current_user
from schemas import SellingCalculationResponse
from models import SellingCalculation, Product
import httpx

router = APIRouter(
    prefix="/api/selling",
    tags=["selling"],
    dependencies=[Depends(get_current_user)]
)

SELLING_WEBHOOK_URL = "https://import-gestion-inventario-402745694567.us-central1.run.app/webhooks/selling_calculation"
WEBHOOK_SECRET = "mati-gordo"

@router.get("/by-code/{product_code}", response_model=SellingCalculationResponse)
def get_selling_calculation_by_code(product_code: str, db: Session = Depends(get_db)):
    """Get selling cost calculation using the product_code (used by Competence modal)"""
    product = db.query(Product).filter(Product.product_code == product_code).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado en el catálogo")
        
    result = db.query(SellingCalculation).filter(
        SellingCalculation.item_id == str(product.id)
    ).first()

    if not result:
        raise HTTPException(
            status_code=404,
            detail="No hay cálculo de venta automático para este producto."
        )

    return result

@router.post("/by-code/{product_code}/calculate")
def trigger_selling_calculation_by_code(product_code: str, db: Session = Depends(get_db)):
    """Trigger the external webhook to calculate selling costs using product_code"""
    product = db.query(Product).filter(Product.product_code == product_code).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado en el catálogo")
        
    payload = {
        "item_id": product.id,
        "secret": WEBHOOK_SECRET
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(SELLING_WEBHOOK_URL, json=payload)

        if response.status_code in (200, 202):
            return {
                "status": "success",
                "message": "Cálculo iniciado. Los datos estarán disponibles en unos segundos."
            }
        else:
            raise HTTPException(
                status_code=502,
                detail=f"Error del servicio externo: {response.status_code} - {response.text[:200]}"
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="El servicio externo tardó demasiado. El cálculo puede completarse en segundo plano."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error enviando solicitud de cálculo: {str(e)}"
        )
