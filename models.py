from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, Float
from db_conn import Base

class Product(Base):
    __tablename__ = "product_catalog_sync"

    id = Column(Integer, primary_key=True)
    product_code = Column(String(255), index=True)
    product_name = Column(String(255), index=True)
    price = Column(Numeric(10, 0))
    product_image_b_format_url = Column(Text)
    product_type_id = Column(String(255))
    product_type_path = Column(String(255))
    product_use_stock = Column(String(50))
    product_sale_type_id = Column(String(50))
    product_search_codes = Column(Text)
    product_type_node_left = Column(String(50))
    product_change_cost_on_sales = Column(String(50))
    stock = Column(Integer)
    description = Column(Text)
    brand = Column(String(255))  # Marca del producto
    meli_id = Column(String(50))  # ID de MercadoLibre
    drive_url = Column(Text)  # URL de Google Drive para fotos
    status = Column(String(50))
    reason = Column(String(255))
    remedy = Column(String(255))
    permalink = Column(String(255))
    product_name_meli = Column(String(255))
    cost = Column(Numeric(10, 0))
    dimentions = Column(String(100))  # Format: 'HxWxL,weight' e.g. '2x5x10,462'
    catalog_link = Column(Text)
    price_mercadolibre = Column(Numeric(10, 0))
    listing_type_id = Column(String(50))
    free_shipping = Column(Integer)
    mode_shipping = Column(String(50))


class User(Base):
    __tablename__ = "inventory_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    role = Column(String(50), default="admin")
    logo_url = Column(String(255), nullable=True) # Deprecated
    theme_pref = Column(String(20), default="light") # For settings


class ScrappedCompetence(Base):
    __tablename__ = "scrapped_competence"
    __table_args__ = {'schema': 'mercadolibre'}

    product_code = Column(String(100), primary_key=True)
    catalog_link = Column(Text, nullable=False)
    # meli_id removed as per user request
    title = Column(String(255))
    price = Column(Integer)
    competitor = Column(String(100))
    price_in_installments = Column(String(255))
    image = Column(Text)
    timestamp = Column(DateTime)
    status = Column(String(50))
    api_cost_total = Column(Integer)
    remaining_credits = Column(Integer)
    product_name = Column(String(255))
    
    # Financial and Cost columns
    selling_price = Column(Numeric(12, 2))
    product_cost = Column(Numeric(12, 2))
    listing_type = Column(String(100))
    ml_commision_percentage = Column(Numeric(10, 2))
    ml_commision = Column(Numeric(10, 2))
    shipping_cost = Column(Numeric(10, 2))
    packaging_cost = Column(Numeric(10, 2))
    advertising_cost = Column(Numeric(10, 2))
    estimated_returns_percentage = Column(Numeric(10, 2))
    returns_cost = Column(Numeric(10, 2))
    withholdings_gross_income_tax = Column(Numeric(10, 2))
    financial_cost = Column(Numeric(10, 2))
    total_costs = Column(Numeric(10, 2))
    net_profit = Column(Numeric(10, 2))
    net_margin_percentage = Column(Numeric(10, 2))
    markup_percentage = Column(Numeric(10, 2))


class SellingCalculation(Base):
    __tablename__ = "selling_calculation"
    __table_args__ = {'schema': 'mercadolibre'}

    item_id = Column(String(50), primary_key=True)
    category_id = Column(String(50))
    sale_fee_amount = Column(Float)
    fixed_fee = Column(Float)
    financing_add_on_fee = Column(Float)
    meli_percentage_fee = Column(Float)
    percentage_fee = Column(Float)
    gross_amount = Column(Float)
    listing_fixed_fee = Column(Float)
    listing_gross_amount = Column(Float)
    ship_cost_amount = Column(Float)
    ship_discount = Column(Float)
    ship_cost_full_amount = Column(Float)
    total_selling_cost = Column(Float)


class Prompt(Base):
    __tablename__ = "prompts"
    __table_args__ = {'schema': 'mercadolibre'}

    id = Column(Integer, primary_key=True)
    ai_auditor = Column(Text)
    ai_category = Column(Text)
    ai_general = Column(Text)
    ai_inventory_search = Column(Text)
    ai_improving_human_reply = Column(Text)
    rules = Column(Text)


class Performance(Base):
    __tablename__ = "performance"
    __table_args__ = {'schema': 'mercadolibre'}

    id = Column(Integer, primary_key=True)
    quality_level = Column(String(50))
    meli_id = Column(String(50), index=True)
    entity_type = Column(String(50))
    overall_score = Column(Integer)
    level_wording = Column(String(100))
    item_calculated_at = Column(DateTime)
    bucket_key = Column(String(100))
    bucket_title = Column(String(255))
    bucket_score = Column(Integer)
    bucket_status = Column(String(50))
    variable_key = Column(String(100))
    variable_title = Column(Text)
    variable_score = Column(Integer)
    variable_status = Column(String(50))
    rule_key = Column(String(100))
    rule_status = Column(String(50))
    rule_progress = Column(Float)
    rule_mode = Column(String(50))
    rule_calculated_at = Column(DateTime)
    wording_title = Column(Text)
    wording_label = Column(String(255))
    wording_link = Column(Text)
