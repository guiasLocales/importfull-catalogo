from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional, List
from datetime import datetime
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
    product_name_meli: Optional[str] = None
    cost: Optional[Decimal] = None
    dimentions: Optional[str] = None
    catalog_link: Optional[str] = None
    price_mercadolibre: Optional[Decimal] = None
    listing_type_id: Optional[str] = None
    free_shipping: Optional[int] = None
    mode_shipping: Optional[str] = None
    price_tienda_nube: Optional[Decimal] = None
    tienda_nube_status: Optional[str] = None
    

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    publish_event: Optional[str] = None
    drive_url: Optional[str] = None
    product_name_meli: Optional[str] = None
    catalog_link: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    price_mercadolibre: Optional[Decimal] = None
    cost: Optional[Decimal] = None
    dimentions: Optional[str] = None
    stock: Optional[int] = None
    listing_type_id: Optional[str] = None
    free_shipping: Optional[int] = None
    mode_shipping: Optional[str] = None
    price_tienda_nube: Optional[Decimal] = None
    tienda_nube_status: Optional[str] = None

class ProductResponse(ProductBase):
    id: int

    @model_validator(mode='after')
    def set_tn_status(self) -> 'ProductResponse':
        if not self.tienda_nube_status:
            if self.price_tienda_nube and self.price_tienda_nube > 0:
                self.tienda_nube_status = 'active'
            else:
                self.tienda_nube_status = 'inactive'
        return self

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
    model_config = ConfigDict(from_attributes=True)
    # meli_id removed
    catalog_link: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    competitor: Optional[str] = None
    price_in_installments: Optional[str] = None
    image: Optional[str] = None
    status: Optional[str] = None
    api_cost_total: Optional[float] = None
    remaining_credits: Optional[float] = None
    product_code: Optional[str] = None
    product_name: Optional[str] = None

    # New Cost/Profit fields
    selling_price: Optional[float] = None
    product_cost: Optional[float] = None
    listing_type: Optional[str] = None
    ml_commision_percentage: Optional[float] = None
    ml_commision: Optional[float] = None
    shipping_cost: Optional[float] = None
    packaging_cost: Optional[float] = None
    advertising_cost: Optional[float] = None
    estimated_returns_percentage: Optional[float] = None
    returns_cost: Optional[float] = None
    withholdings_gross_income_tax: Optional[float] = None
    financial_cost: Optional[float] = None
    total_costs: Optional[float] = None
    auto_meli_cost: Optional[float] = None
    net_profit: Optional[float] = None
    net_margin_percentage: Optional[float] = None
    markup_percentage: Optional[float] = None
    internal_price: Optional[float] = None

class CompetenceCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    catalog_link: str  # Only field the user provides (was 'url')
    product_code: Optional[str] = None
    product_name: Optional[str] = None

class CompetenceUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    selling_price: Optional[float] = None
    product_cost: Optional[float] = None
    listing_type: Optional[str] = None
    ml_commision_percentage: Optional[float] = None
    ml_commision: Optional[float] = None
    shipping_cost: Optional[float] = None
    packaging_cost: Optional[float] = None
    advertising_cost: Optional[float] = None
    estimated_returns_percentage: Optional[float] = None
    returns_cost: Optional[float] = None
    withholdings_gross_income_tax: Optional[float] = None
    financial_cost: Optional[float] = None
    total_costs: Optional[float] = None
    net_profit: Optional[float] = None
    net_margin_percentage: Optional[float] = None
    markup_percentage: Optional[float] = None

class CompetenceResponse(CompetenceBase):
    model_config = ConfigDict(from_attributes=True)
    timestamp: Optional[datetime] = None
    # No id field in DB

class CompetenceListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: List[CompetenceResponse]
    total: int
    pending_count: int
    completed_count: int
    error_count: int


# --- Prompts Schemas ---
class PromptUpdate(BaseModel):
    ai_general: Optional[str] = None
    rules: Optional[str] = None
    ai_improving_human_reply: Optional[str] = None

class PromptResponse(BaseModel):
    id: int
    ai_auditor: Optional[str] = None
    ai_category: Optional[str] = None
    ai_general: Optional[str] = None
    ai_inventory_search: Optional[str] = None
    ai_improving_human_reply: Optional[str] = None
    rules: Optional[str] = None
    
    class Config:
        from_attributes = True


# --- Selling Calculation Schemas ---
class SellingCalculationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: Optional[str] = None
    category_id: Optional[str] = None
    sale_fee_amount: Optional[float] = None
    fixed_fee: Optional[float] = None
    financing_add_on_fee: Optional[float] = None
    meli_percentage_fee: Optional[float] = None
    percentage_fee: Optional[float] = None
    gross_amount: Optional[float] = None
    listing_fixed_fee: Optional[float] = None
    listing_gross_amount: Optional[float] = None
    ship_cost_amount: Optional[float] = None
    ship_discount: Optional[float] = None
    ship_cost_full_amount: Optional[float] = None
    total_selling_cost: Optional[float] = None


# --- Performance / Quality Score Schemas ---

class PerformanceRuleRow(BaseModel):
    """A single rule row as returned by the DB query."""
    model_config = ConfigDict(from_attributes=True)

    meli_id: Optional[str] = None
    quality_level: Optional[str] = None
    overall_score: Optional[int] = None
    level_wording: Optional[str] = None
    bucket_title: Optional[str] = None
    bucket_status: Optional[str] = None
    rule_status: Optional[str] = None
    rule_mode: Optional[str] = None
    rule_progress: Optional[float] = None
    wording_title: Optional[str] = None
    wording_label: Optional[str] = None
    wording_link: Optional[str] = None
    item_calculated_at: Optional[datetime] = None


class PerformanceSummary(BaseModel):
    """Top-level quality summary for a product."""
    meli_id: str
    quality_level: Optional[str] = None
    overall_score: Optional[int] = None
    level_wording: Optional[str] = None
    item_calculated_at: Optional[datetime] = None


class PerformanceResponse(BaseModel):
    """Full performance data: summary + ordered rule rows."""
    summary: Optional[PerformanceSummary] = None
    rows: List[PerformanceRuleRow] = []


class PerformanceScoreItem(BaseModel):
    """Lightweight score for display in the MeLi product table."""
    meli_id: str
    overall_score: Optional[int] = None
    quality_level: Optional[str] = None
    level_wording: Optional[str] = None
