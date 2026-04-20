from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from db_conn import get_db
from schemas import ProductResponse, PublishRequest, ProductUpdate, TiendaNubeAttributeSchema, TiendaNubeStatusResponse
from routers.auth import get_current_user
import crud
import httpx
import asyncio
from services import drive_service
import models
from pydantic import BaseModel
import os

router = APIRouter(
    prefix="/api/products",
    tags=["products"],
    dependencies=[Depends(get_current_user)]  # ALL routes require auth
)

# Webhook configuration
WEBHOOK_URL = "https://import-gestion-inventario-402745694567.us-central1.run.app/webhooks/publications"
WEBHOOK_SECRET = "mati-gordo"

def send_webhook(item_id: int, event_type: str, site: Optional[str] = None, extra_data: dict = None):
    """Send webhook notification for events (publish/paused/update/pre-publish)"""
    data = {
        "event_type": event_type,
        "item_id": item_id,
        "secret": WEBHOOK_SECRET
    }
    if site:
        data["site"] = site
        
    if extra_data:
        data["data"] = extra_data
    try:
        print(f"DEBUG: Sending webhook to {WEBHOOK_URL} with data: {data}")
        # Increased timeout to 30s as publication services can be slow
        with httpx.Client(timeout=30.0) as client:
            response = client.post(WEBHOOK_URL, json=data)
            print(f"Webhook sent for item {item_id}: {data['event_type']} - Status: {response.status_code}")
            
            if response.status_code in (200, 202):
                return True, "Success"
            else:
                # Return more of the error body to help debugging (up to 500 chars)
                error_body = response.text[:500]
                return False, f"Status: {response.status_code} - {error_body}"
    except Exception as e:
        print(f"Webhook error for item {item_id}: {e}")
        return False, str(e)

@router.get("/", response_model=List[ProductResponse])
def read_products(
    skip: int = 0, 
    limit: int = 50,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    stock_filter: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'asc',
    q: Optional[str] = None,
    status: Optional[str] = None,
    site: Optional[str] = None,
    db: Session = Depends(get_db)
):
    products = crud.get_products(
        db, skip=skip, limit=limit, 
        category=category, brand=brand, 
        search=q,
        stock_filter=stock_filter,
        status=status,
        site=site,
        sort_by=sort_by, sort_order=sort_order
    )
    return products

@router.get("/summary")
def get_products_summary(site: Optional[str] = None, db: Session = Depends(get_db)):
    """Get count summary for dashboard indicators"""
    # For now, we use a simple count. 
    # If site is tienda-nube, we might want to filter but since we don't have 
    # a dedicated column yet that we can rely on, we return general counts.
    total = db.query(models.Product).count()
    
    # Heuristic for TN active: has a TN price
    active_tn = db.query(models.Product).filter(
        models.Product.price_tienda_nube != None,
        models.Product.price_tienda_nube > 0
    ).count()
    
    return {
        "total": total,
        "active_count": active_tn,
        "paused_count": 0,
        "unpublished_count": total - active_tn
    }

@router.get("/meli")
def read_meli_products(
    skip: int = 0,
    limit: int = 500,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all products published on MercadoLibre"""
    result = crud.get_meli_products(db, skip=skip, limit=limit, status=status, search=q)
    return {
        "products": [ProductResponse.model_validate(p) for p in result["products"]],
        "total": result["total"],
        "active_count": result["active_count"],
        "paused_count": result["paused_count"]
    }

@router.get("/categories", response_model=List[str])
def read_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@router.get("/search", response_model=List[ProductResponse])
def search_products(
    q: str = Query(..., min_length=1),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    products = crud.search_products(db, query_str=q, skip=skip, limit=limit)
    return products


@router.get("/{product_id}", response_model=ProductResponse)
def read_product(product_id: int, db: Session = Depends(get_db)):
    db_product = crud.get_product(db, product_id=product_id)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return db_product

@router.patch("/{product_id}/publish", response_model=ProductResponse)
def update_publish_status(
    product_id: int, 
    request: PublishRequest, 
    db: Session = Depends(get_db)
):
    """Trigger publish/pause/delete webhook and update status in DB"""
    print(f"DEBUG: Received action='{request.action}', site='{request.site}'")
    if request.action not in ["publish", "pause", "delete"]:
        raise HTTPException(status_code=400, detail="action must be 'publish', 'pause' or 'delete'")
    
    # Verify product exists
    db_product = crud.get_product(db, product_id)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Write intermediate status to DB
    new_status = "en proceso"
    if request.action == "publish": new_status = "en proceso"
    elif request.action == "pause": new_status = "pausando"
    elif request.action == "delete": new_status = "eliminando"
    
    db_product.status = new_status
    db.commit()
    db.refresh(db_product)
    
    # Send webhook notification (external service will set final status)
    send_webhook(product_id, request.action, site=request.site)
    
    return db_product

@router.delete("/{product_id}/delete-meli")
def delete_meli_publication(product_id: int, db: Session = Depends(get_db)):
    """Proxy deletion request to webhook to avoid CORS issues"""
    db_product = crud.get_product(db, product_id)
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Set intermediate status
    db_product.status = 'eliminando'
    db.commit()
    db.refresh(db_product)
    
    # Trigger webhook
    success, msg = send_webhook(product_id, "delete")
    if not success:
        raise HTTPException(status_code=500, detail=f"Error enviando solicitud de eliminación: {msg}")
        
    return {"status": "success", "message": "Solicitud de eliminación enviada"}

@router.patch("/{product_id}", response_model=ProductResponse)
def patch_product(
    product_id: int, 
    request: ProductUpdate, 
    db: Session = Depends(get_db)
):
    updates = request.dict(exclude_unset=True)
    db_product = crud.update_product(db, product_id=product_id, updates=updates)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
        
    return db_product

@router.put("/{product_id}", response_model=ProductResponse)
def put_product(
    product_id: int, 
    request: ProductUpdate, 
    db: Session = Depends(get_db)
):
    """PUT endpoint for frontend compatibility"""
    updates = request.dict(exclude_unset=True)
    db_product = crud.update_product(db, product_id=product_id, updates=updates)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
        
    return db_product

@router.post("/{product_id}/notify")
def notify_product_update(product_id: int, db: Session = Depends(get_db)):
    """Manually trigger an update webhook notification and set status to actualizando"""
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Write intermediate status to DB
    product.status = "actualizando"
    db.commit()
    db.refresh(product)
        
    success, msg = send_webhook(product_id, "update")
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to send webhook: {msg}")
        
    return {"status": "success", "message": "Update notification sent"}



class PrePublishRequest(BaseModel):
    prompt: str
    field: str # 'product_name_meli' or 'description'

@router.post("/{product_id}/pre-publish")
def trigger_pre_publish(
    product_id: int, 
    request: PrePublishRequest,
    db: Session = Depends(get_db)
):
    """Send pre-publish webhook to external service for AI content generation"""
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    extra_data = {
        "prompt": request.prompt,
        "field": request.field
    }
    
    success, msg = send_webhook(product_id, "pre-publish", extra_data=extra_data)
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Error enviando al servicio de AI: {msg}")

    return {
        "status": "success", 
        "message": "Solicitud enviada al servicio de AI. El campo se actualizará en unos momentos.",
        "field": request.field
    }

@router.post("/{product_id}/upload")
async def upload_product_photo(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Fetch product
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 2. Get Drive Service
    service = drive_service.get_drive_service()
    if not service:
        raise HTTPException(status_code=500, detail="Could not connect to Google Drive")

    # 3. Determine Folder ID
    folder_id = None
    if product.drive_url:
        folder_id = drive_service.extract_id_from_url(product.drive_url)
    
    # 4. If no folder, create one
    if not folder_id:
        folder_name = str(product.id)
        new_folder = drive_service.create_folder(
            service, 
            folder_name, 
            parent_id=drive_service.ROOT_FOLDER_ID
        )
        if new_folder:
            folder_id = new_folder.get('id')
            # Save new URL to DB
            new_url = new_folder.get('webViewLink')
            crud.update_product(db, product_id, {'drive_url': new_url})
            product.drive_url = new_url # Update local obj for response
        else:
            raise HTTPException(status_code=500, detail="Failed to create Drive folder")

    # 5. Upload file
    try:
        content = await file.read()
        uploaded_file = drive_service.upload_file(
            service, 
            content, 
            file.filename, 
            folder_id, 
            content_type=file.content_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file to Drive: {str(e)}")

    if not uploaded_file:
         raise HTTPException(status_code=500, detail="Failed to upload file to Drive (Unknown error)")

    return {
        "detail": "File uploaded successfully",
        "file_id": uploaded_file.get('id'),
        "drive_url": product.drive_url or uploaded_file.get('webViewLink') 
    }

@router.get("/{product_id}/files")
def get_product_files(
    product_id: int,
    db: Session = Depends(get_db)
):
    product = crud.get_product(db, product_id)
    if not product or not product.drive_url:
        return []

    service = drive_service.get_drive_service()
    if not service:
        return []

    folder_id = drive_service.extract_id_from_url(product.drive_url)
    if not folder_id:
        return []

    files = drive_service.list_files(service, folder_id)
    
    # Replace thumbnailLink with our proxy URL
    for file in files:
        file_id = file.get('id')
        if file_id:
            # file['thumbnailLink'] = f"/api/products/drive-image/{file_id}"
            # file['largeImageLink'] = f"/api/products/drive-image/{file_id}?size=large"
            # Use original links but ensure they are capable of serving content
            pass
    
    return files

@router.get("/{product_id}/tienda-nube-attributes", response_model=TiendaNubeAttributeSchema)
def get_tienda_nube_attributes(product_id: int, db: Session = Depends(get_db)):
    """Fetch extra attributes for Tienda Nube (SEO, tags, etc.)"""
    attrs = crud.get_tn_attributes(db, product_id)
    if not attrs:
        # Return empty attributes if not found, but with item_id
        return TiendaNubeAttributeSchema(item_id=product_id)
    return attrs

@router.put("/{product_id}/tienda-nube-attributes", response_model=TiendaNubeAttributeSchema)
def update_tienda_nube_attributes(
    product_id: int, 
    request: TiendaNubeAttributeSchema, 
    db: Session = Depends(get_db)
):
    """Update or create extra attributes for Tienda Nube"""
    updates = request.dict(exclude_unset=True)
    # Ensure item_id is correct
    updates['item_id'] = product_id
    attrs = crud.update_tn_attributes(db, product_id, updates)
    return attrs

@router.get("/{product_id}/tienda-nube-status", response_model=Optional[TiendaNubeStatusResponse])
def get_tienda_nube_status(product_id: int, db: Session = Depends(get_db)):
    """Get the specific API response status for Tienda Nube publication"""
    attrs = crud.get_tn_attributes(db, product_id)
    if not attrs:
        return None
    return crud.get_tn_product_status(db, attrs.id)

@router.get("/drive-image/{file_id}")
def get_drive_image(file_id: str, size: str = "thumbnail"):
    """Proxy endpoint to serve Drive images with authentication"""
    from fastapi.responses import StreamingResponse
    import io
    
    service = drive_service.get_drive_service()
    if not service:
        raise HTTPException(status_code=500, detail="Drive service unavailable")
    
    try:
        # Get file metadata to determine mime type
        file_metadata = service.files().get(fileId=file_id, fields="mimeType").execute()
        mime_type = file_metadata.get('mimeType', 'image/jpeg')
        
        # Download file content
        request = service.files().get_media(fileId=file_id)
        file_content = io.BytesIO()
        
        from googleapiclient.http import MediaIoBaseDownload
        downloader = MediaIoBaseDownload(file_content, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        file_content.seek(0)
        return StreamingResponse(file_content, media_type=mime_type)
        
    except Exception as e:
        print(f"Error serving Drive image: {e}")
        raise HTTPException(status_code=404, detail="Image not found")

