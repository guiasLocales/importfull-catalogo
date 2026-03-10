from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime
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
    catalog_link = Column(Text)


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

    # Removed id column to match existing DB
    catalog_link = Column(Text, primary_key=True)  # Using catalog_link as logical PK
    # meli_id removed as per user request
    title = Column(String(500))
    price = Column(Numeric(10, 2))
    competitor = Column(String(255))
    price_in_installments = Column(String(255))
    image = Column(Text)
    timestamp = Column(DateTime)
    status = Column(String(50))
    api_cost_total = Column(Numeric(10, 4))
    remaining_credits = Column(Numeric(10, 4))
    product_code = Column(String(255))
    product_name = Column(String(500))
    
    # New Cost/Profit fields
    selling_price = Column(Numeric(10, 0))
    product_cost = Column(Numeric(10, 0))
    listing_type = Column(String(100))
    ml_commision_percentage = Column(Numeric(5, 2))
    ml_commision = Column(Numeric(10, 2))
    shipping_cost = Column(Numeric(10, 2))
    packaging_cost = Column(Numeric(10, 2))
    advertising_cost = Column(Numeric(10, 2))
    estimated_returns_percentage = Column(Numeric(5, 2))
    returns_cost = Column(Numeric(10, 2))
    withholdings_gross_income_tax = Column(Numeric(10, 2))
    financial_cost = Column(Numeric(10, 2))
    total_costs = Column(Numeric(10, 2))
    net_profit = Column(Numeric(10, 2))
    net_margin_percentage = Column(Numeric(5, 2))
    markup_percentage = Column(Numeric(5, 2))


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
