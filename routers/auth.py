from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import os

import crud, models, schemas
from db_conn import get_db

router = APIRouter(tags=["auth"])

# Secret key
SECRET_KEY = "supersecretkeychangeinproduction"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=form_data.username)
    if user:
        password_valid = verify_password(form_data.password, user.hashed_password)
    else:
        password_valid = False
        
    if not user or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user

@router.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.patch("/users/me", response_model=schemas.User)
async def update_user_me(user_update: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    update_data = user_update.dict(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        hashed_pw = get_password_hash(update_data["password"])
        update_data["hashed_password"] = hashed_pw
        del update_data["password"]
    
    return crud.update_user(db, current_user, update_data)


# =============================================================================
# LOGO SYSTEM - Simple & Reliable
# Uses fixed filenames on Drive. No JSON settings file needed.
# Files: app_logo_light, app_logo_dark, app_logo_favicon
# =============================================================================

# Fixed filenames for each logo type
LOGO_FILENAMES = {
    "light": "app_logo_light",
    "dark": "app_logo_dark",
    "favicon": "app_logo_favicon",
}

def _find_logo_file(service, logo_type, folder_id):
    """Search Drive for a logo file by its fixed prefix name."""
    prefix = LOGO_FILENAMES.get(logo_type)
    if not prefix:
        return None
    
    # Search for files starting with our prefix
    query = f"name contains '{prefix}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(
        q=query, 
        fields="files(id, name, mimeType)",
        orderBy="modifiedTime desc",  # Most recent first
        pageSize=5
    ).execute()
    
    files = results.get('files', [])
    if files:
        return files[0]  # Return the most recent one
    return None

def _delete_old_logos(service, logo_type, folder_id):
    """Delete ALL old versions of a logo type to prevent duplicates."""
    prefix = LOGO_FILENAMES.get(logo_type)
    if not prefix:
        return
    
    query = f"name contains '{prefix}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    
    for f in results.get('files', []):
        try:
            service.files().delete(fileId=f['id']).execute()
            print(f"Deleted old logo: {f['name']} ({f['id']})")
        except Exception as e:
            print(f"Warning: Could not delete old logo {f['id']}: {e}")


@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...), 
    logo_type: str = "light",
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Upload logo to Google Drive with a fixed filename. Simple and reliable."""
    try:
        from services import drive_service
        
        service = drive_service.get_drive_service()
        if not service:
            raise HTTPException(status_code=500, detail="Could not connect to Google Drive")
        
        folder_id = drive_service.ROOT_FOLDER_ID
        
        # Read file
        file_content = await file.read()
        
        # Build fixed filename with original extension
        extension = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'png'
        prefix = LOGO_FILENAMES.get(logo_type)
        if not prefix:
            raise HTTPException(status_code=400, detail=f"Invalid logo type: {logo_type}")
        
        filename = f"{prefix}.{extension}"
        
        # 1. Delete any existing versions (prevent duplicates)
        _delete_old_logos(service, logo_type, folder_id)
        
        # 2. Upload new file (public so it works everywhere)
        uploaded_file = drive_service.upload_file(
            service=service,
            file_content=file_content,
            file_name=filename,
            folder_id=folder_id,
            content_type=file.content_type or 'image/png',
            make_public=True
        )
        
        if not uploaded_file:
            raise HTTPException(status_code=500, detail="Failed to upload to Drive")
        
        file_id = uploaded_file.get('id')
        proxy_url = f"/logo/{logo_type}"
        
        print(f"Logo '{logo_type}' uploaded: {filename} (ID: {file_id})")
        
        return {
            "logo_url": proxy_url,
            "logo_type": logo_type,
            "drive_file_id": file_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error uploading logo: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to upload logo: {str(e)}")


@router.get("/logo/{logo_type}")
async def get_logo_content(logo_type: str):
    """Serve logo image from Drive. Searches by fixed filename — no JSON needed."""
    try:
        from services import drive_service
        
        service = drive_service.get_drive_service()
        if not service:
            return Response(status_code=503, content=b"Drive unavailable")
        
        folder_id = drive_service.ROOT_FOLDER_ID
        
        # Find the logo file by name
        logo_file = _find_logo_file(service, logo_type, folder_id)
        if not logo_file:
            return Response(status_code=404)
        
        file_id = logo_file['id']
        mime_type = logo_file.get('mimeType', 'image/png')
        
        # Download content
        content = service.files().get_media(fileId=file_id).execute()
        
        # Cache for 1 hour
        headers = {"Cache-Control": "public, max-age=3600"}
        return Response(content=content, media_type=mime_type, headers=headers)
        
    except Exception as e:
        print(f"Error serving logo '{logo_type}': {e}")
        return Response(status_code=500)


@router.get("/public-settings")
async def get_public_settings():
    """Return proxy URLs for available logos (public, no auth needed)."""
    try:
        from services import drive_service
        
        service = drive_service.get_drive_service()
        if not service:
            return {"logo_light_url": None, "logo_dark_url": None, "favicon_url": None}
        
        folder_id = drive_service.ROOT_FOLDER_ID
        
        result = {}
        for logo_type in ["light", "dark", "favicon"]:
            found = _find_logo_file(service, logo_type, folder_id)
            key = f"logo_{logo_type}_url" if logo_type != "favicon" else "favicon_url"
            result[key] = f"/logo/{logo_type}" if found else None
        
        return result
        
    except Exception as e:
        print(f"Error in public-settings: {e}")
        return {"logo_light_url": None, "logo_dark_url": None, "favicon_url": None}


@router.get("/settings")
async def get_settings(current_user: models.User = Depends(get_current_user)):
    """Get application settings (same as public-settings but authenticated)."""
    return await get_public_settings()
