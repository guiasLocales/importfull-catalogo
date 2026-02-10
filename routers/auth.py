from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import shutil
import os

import crud, models, schemas
from db_conn import get_db

router = APIRouter(tags=["auth"])

# Secret key (hardcoded for now or env var)
SECRET_KEY = "supersecretkeychangeinproduction"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours for easier testing

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
    print(f"DEBUG LOGIN: Attempting login for user: {form_data.username}")
    user = crud.get_user_by_username(db, username=form_data.username)
    print(f"DEBUG LOGIN: User found: {user is not None}")
    
    if user:
        print(f"DEBUG LOGIN: Stored hash: {user.hashed_password[:20]}...")
        print(f"DEBUG LOGIN: Password received: {form_data.password}")
        password_valid = verify_password(form_data.password, user.hashed_password)
        print(f"DEBUG LOGIN: Password verification result: {password_valid}")
    else:
        password_valid = False
        
    if not user or not password_valid:
        print(f"DEBUG LOGIN: Authentication FAILED")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"DEBUG LOGIN: Authentication SUCCESS for {user.username}")
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
    update_data = user_update.dict(exclude_unset=True) # using dict() for broader compatibility or check v2
    if "password" in update_data and update_data["password"]:
        hashed_pw = get_password_hash(update_data["password"])
        update_data["hashed_password"] = hashed_pw
        del update_data["password"]
    
    return crud.update_user(db, current_user, update_data)

@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...), 
    logo_type: str = "light",  # "light" or "dark"
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Upload logo to Google Drive and save URL to user settings"""
    try:
        from services import drive_service
        
        # Get Drive service
        service = drive_service.get_drive_service()
        if not service:
            raise HTTPException(status_code=500, detail="Could not connect to Google Drive")
        
        # Create 'logos' folder if it doesn't exist
        # We'll use a fixed folder for logos
        logos_folder_id = os.getenv('LOGOS_FOLDER_ID', drive_service.ROOT_FOLDER_ID)
        
        # Read file content
        file_content = await file.read()
        
        # Upload to Drive
        filename = f"logo_{logo_type}_{current_user.username}_{file.filename}"
        uploaded_file = drive_service.upload_file(
            service=service,
            file_content=file_content,
            file_name=filename,
            folder_id=logos_folder_id,
            content_type=file.content_type or 'image/png'
        )
        
        if not uploaded_file:
            raise HTTPException(status_code=500, detail="Failed to upload logo to Drive")
        
        # Get the Drive URL (use thumbnailLink or webViewLink)
        logo_url = uploaded_file.get('thumbnailLink') or uploaded_file.get('webViewLink')
        
        # Update user record
        if logo_type == "light":
            crud.update_user(db, current_user, {"logo_light_url": logo_url})
        else:
            crud.update_user(db, current_user, {"logo_dark_url": logo_url})
        
        return {
            "logo_url": logo_url,
            "logo_type": logo_type,
            "drive_file_id": uploaded_file.get('id')
        }
        
    except Exception as e:
        print(f"Error uploading logo: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload logo: {str(e)}")

