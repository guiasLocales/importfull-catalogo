from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

class ProductBase(BaseModel):
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    price: Optional[Decimal] = None
    product_image_b_format_url: Optional[str] = None
    product_type_id: Optional[str] = None
    product_type_path: Optional[str] = None
    product_use_stock: Optional[str] = None
    product_sale_type_id: Optional[str] = None
    product_search_codes: Optional[str] = None
    product_type_node_left: Optional[str] = None
    product_change_cost_on_sales: Optional[str] = None
    stock: Optional[int] = None
    description: Optional[str] = None
    brand: Optional[str] = None
    meli_id: Optional[str] = None
    drive_url: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None
    remedy: Optional[str] = None
    permalink: Optional[str] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    publish_event: Optional[str] = None
    drive_url: Optional[str] = None

class ProductResponse(ProductBase):
    id: int

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    role: str
    logo_url: Optional[str] = None
    logo_light_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    theme_pref: Optional[str] = None
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    password: Optional[str] = None
    logo_url: Optional[str] = None
    logo_light_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    theme_pref: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class PublishRequest(BaseModel):
    action: str  # 'publish' or 'pause'


# --- Competence Schemas ---
class CompetenceBase(BaseModel):
    meli_id: Optional[str] = None
    url: Optional[str] = None
    title: Optional[str] = None
    price: Optional[Decimal] = None
    competitor: Optional[str] = None
    price_in_installments: Optional[str] = None
    image: Optional[str] = None
    status: Optional[str] = None
    api_cost_total: Optional[Decimal] = None
    remaining_credits: Optional[Decimal] = None
    product_code: Optional[str] = None
    product_name: Optional[str] = None

class CompetenceCreate(BaseModel):
    url: str  # Only field the user provides
    product_code: Optional[str] = None
    product_name: Optional[str] = None

class CompetenceResponse(CompetenceBase):
    timestamp: Optional[str] = None
    # No id field in DB

    class Config:
        from_attributes = True

class CompetenceUpdate(BaseModel):
    url: Optional[str] = None
