from sqlalchemy import Column, Integer, String, Text, Numeric
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


class User(Base):
    __tablename__ = "inventory_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    role = Column(String(50), default="admin")
    logo_url = Column(String(255), nullable=True) # For settings
    logo_light_url = Column(String(255), nullable=True) # Logo for light mode
    logo_dark_url = Column(String(255), nullable=True) # Logo for dark mode
    theme_pref = Column(String(20), default="light") # For settings
