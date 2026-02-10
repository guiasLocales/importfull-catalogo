from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from db_conn import get_db
from schemas import ProductResponse, PublishRequest, ProductUpdate
from routers.auth import get_current_user
import crud
import httpx
import asyncio
from services import drive_service

router = APIRouter(
    prefix="/api/products",
    tags=["products"],
    dependencies=[Depends(get_current_user)]  # ALL routes require auth
)

# Webhook configuration
WEBHOOK_URL = "https://import-gestion-inventario-402745694567.us-central1.run.app/webhooks/goog-app/publications"
WEBHOOK_SECRET = "mati-gordo"

def send_webhook(item_id: int, event_type: str):
    """Send webhook notification for events (publish/paused/update)"""
    data = {
        "event_type": event_type,
        "item_id": item_id,
        "secret": WEBHOOK_SECRET
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(WEBHOOK_URL, json=data)
            print(f"Webhook sent for item {item_id}: {data['event_type']} - Status: {response.status_code}")
            return response.status_code == 200
    except Exception as e:
        print(f"Webhook error for item {item_id}: {e}")
        return False

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
    db: Session = Depends(get_db)
):
    products = crud.get_products(
        db, skip=skip, limit=limit, 
        category=category, brand=brand, 
        search=q,
        stock_filter=stock_filter,
        sort_by=sort_by, sort_order=sort_order
    )
    return products

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
    """Trigger publish/pause webhook - does NOT modify database, only sends notification"""
    print(f"DEBUG: Received action='{request.action}'")
    if request.action not in ["publish", "pause"]:
        raise HTTPException(status_code=400, detail="action must be 'publish' or 'pause'")
    
    # Verify product exists
    db_product = crud.get_product(db, product_id)
    if db_product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Send webhook notification (database will be updated by external service)
    event_type = request.action
    send_webhook(product_id, event_type)
    
    return db_product

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

@router.post("/{product_id}/notify")
def notify_product_update(product_id: int, db: Session = Depends(get_db)):
    """Manually trigger an update webhook notification"""
    product = crud.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    success = send_webhook(product_id, "update")
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send webhook")
        
    return {"status": "success", "message": "Update notification sent"}

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
            file['thumbnailLink'] = f"/api/products/drive-image/{file_id}"
            file['largeImageLink'] = f"/api/products/drive-image/{file_id}?size=large"
    
    return files

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

