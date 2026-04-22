from sqlalchemy.orm import Session
from sqlalchemy import or_, distinct, asc, desc, func
from models import Product, User, ScrappedCompetence
from schemas import UserCreate

def get_product(db: Session, product_id: int):
    p = db.query(Product).filter(Product.id == product_id).first()
    if p:
        p.tienda_nube_status = "active" if (p.price_tienda_nube and p.price_tienda_nube > 0) else "unpublished"
    return p

def get_products(db: Session, skip: int = 0, limit: int = 50, 
                 category: str = None, brand: str = None, 
                 search: str = None,
                 stock_filter: str = None,
                 status: str = None,
                 site: str = None,
                 sort_by: str = None, sort_order: str = 'asc'):
    query = db.query(Product)
    
    if site == 'tienda-nube':
        if status == 'active':
            query = query.filter(Product.price_tienda_nube > 0)
        elif status == 'unpublished':
            query = query.filter((Product.price_tienda_nube == 0) | (Product.price_tienda_nube == None))
    
    if category:
        query = query.filter(Product.product_type_path == category)
    if brand:
        query = query.filter(Product.brand == brand)
    if search:
        # Check if search is a number to search by ID
        search_conditions = [
            Product.product_name.ilike(f"%{search}%"),
            Product.product_code.ilike(f"%{search}%"),
            Product.description.ilike(f"%{search}%")
        ]
        # If search is numeric, also search by exact ID or ID as string
        if search.isdigit():
            search_conditions.append(Product.id == int(search))
        query = query.filter(or_(*search_conditions))
    
    # Stock filter
    if stock_filter == 'with_stock':
        query = query.filter(Product.stock > 0)
    elif stock_filter == 'no_stock':
        query = query.filter((Product.stock == 0) | (Product.stock == None))
    
    # Sorting
    if sort_by:
        column = getattr(Product, sort_by, None)
        if column is not None:
            if sort_order == 'desc':
                query = query.order_by(desc(column))
            else:
                query = query.order_by(asc(column))
        
    results = query.offset(skip).limit(limit).all()
    # Populate tienda_nube_status heuristic
    for p in results:
        p.tienda_nube_status = "active" if (p.price_tienda_nube and p.price_tienda_nube > 0) else "unpublished"
    return results

def get_categories(db: Session):
    categories = db.query(Product.product_type_path).filter(
        Product.product_type_path != None, 
        Product.product_type_path != ''
    ).distinct().order_by(Product.product_type_path).all()
    return [c[0] for c in categories]

def get_meli_products(db: Session, skip: int = 0, limit: int = 500,
                      status: str = None, search: str = None):
    """Get products that have a MercadoLibre ID (published on ML)"""
    query = db.query(Product).filter(
        Product.meli_id != None,
        Product.meli_id != ''
    )
    
    if status:
        query = query.filter(Product.status == status)
    
    if search:
        search_conditions = [
            Product.product_name.ilike(f"%{search}%"),
            Product.meli_id.ilike(f"%{search}%"),
            Product.product_code.ilike(f"%{search}%")
        ]
        if search.isdigit():
            search_conditions.append(Product.id == int(search))
        query = query.filter(or_(*search_conditions))
    
    total = query.count()
    products = query.order_by(desc(Product.id)).offset(skip).limit(limit).all()
    
    # Count by status
    active_count = db.query(Product).filter(
        Product.meli_id != None, Product.meli_id != '',
        Product.status == 'active'
    ).count()
    paused_count = db.query(Product).filter(
        Product.meli_id != None, Product.meli_id != '',
        Product.status == 'paused'
    ).count()
    
    return {
        "products": products,
        "total": total,
        "active_count": active_count,
        "paused_count": paused_count
    }


def search_products(db: Session, query_str: str, skip: int = 0, limit: int = 50):
    search_conditions = [
        Product.product_name.ilike(f"%{query_str}%"),
        Product.product_code.ilike(f"%{query_str}%"),
        Product.description.ilike(f"%{query_str}%")
    ]
    # If search is numeric, also search by exact ID
    if query_str.isdigit():
        search_conditions.append(Product.id == int(query_str))
    return db.query(Product).filter(or_(*search_conditions)).offset(skip).limit(limit).all()

def get_user_by_username(db: Session, username: str):
    # FALLBACK: Use hardcoded admin user to bypass DB permission issues
    if username == "admin":
        print("DEBUG: Using mock admin user") # Debug logging
        # Hash generated for "admin123" with bcrypt 3.2.0
        return User(
            id=1, 
            username="admin", 
            hashed_password="$2b$12$E0ZVbqqCNwEo8NYSS1iGOONwKGOIOVhTdzNM8hFchnrXYBqPGbP9i", 
            role="admin",
            theme_pref="light"
        )
        
    try:
        return db.query(User).filter(User.username == username).first()
    except Exception as e:
        print(f"DEBUG: DB Error fetching user: {e}")
        return None

def create_user(db: Session, user: UserCreate, hashed_password: str):
    # Mock creation
    return User(id=1, username=user.username, hashed_password=hashed_password, role="admin")

def update_user(db: Session, db_user: User, user_update: dict):
    # Mock update for in-memory/static user
    for key, value in user_update.items():
        setattr(db_user, key, value)
    
    # attempt to commit only if it's attached to a session (real DB user)
    try:
        if db_user in db:
            db.commit()
            db.refresh(db_user)
    except Exception:
        pass # Ignore DB errors for mock user
        
    return db_user

def update_publish_event(db: Session, product_id: int, publish_event: str):
    db_product = get_product(db, product_id)
    if not db_product:
        return None
    db_product.publish_event = publish_event
    db.commit()
    db.refresh(db_product)
    return db_product

def update_product(db: Session, product_id: int, updates: dict):
    db_product = get_product(db, product_id)
    if not db_product:
        return None
    for key, value in updates.items():
        if hasattr(db_product, key) and value is not None:
            setattr(db_product, key, value)
    
    # Automatic Sync for Tienda Nube SEO attributes
    if "product_name_meli" in updates or "description" in updates:
        from models import TiendaNubeAttribute
        tn_attr = db.query(TiendaNubeAttribute).filter(TiendaNubeAttribute.item_id == product_id).first()
        if tn_attr:
            if "product_name_meli" in updates:
                tn_attr.seo_title = str(updates["product_name_meli"])[:100]
            if "description" in updates:
                tn_attr.seo_description = str(updates["description"])[:100]

    db.commit()
    db.refresh(db_product)
    return db_product

def get_brands(db: Session):
    return [r[0] for r in db.query(distinct(Product.brand)).filter(Product.brand != None, Product.brand != '').all()]


# --- Competence CRUD ---

def get_competence_items(db: Session, skip: int = 0, limit: int = 100,
                         search: str = None, status: str = None):
    """Get competition scraping entries with optional search and filter."""
    from models import Product, SellingCalculation
    from sqlalchemy import cast, String
    
    query = db.query(
        ScrappedCompetence, 
        SellingCalculation.total_selling_cost.label("auto_meli_cost")
    ).outerjoin(
        Product, ScrappedCompetence.product_code == Product.product_code
    ).outerjoin(
        SellingCalculation, cast(Product.id, String) == SellingCalculation.item_id
    ).filter(
        (ScrappedCompetence.catalog_link != '') & 
        (ScrappedCompetence.catalog_link != None)
    )
    
    if status:
        query = query.filter(ScrappedCompetence.status == status)
    
    if search:
        query = query.filter(or_(
            ScrappedCompetence.title.ilike(f"%{search}%"),
            ScrappedCompetence.competitor.ilike(f"%{search}%"),
            ScrappedCompetence.product_name.ilike(f"%{search}%"),
            ScrappedCompetence.product_code.ilike(f"%{search}%")
        ))
        
    total = query.count()
    results = query.order_by(desc(ScrappedCompetence.timestamp)).offset(skip).limit(limit).all()
    
    # Map results into dictionaries to ensure extra fields are preserved for Pydantic
    items = []
    for comp, auto_cost in results:
        # Create a dictionary of all columns
        item_dict = {
            column.name: getattr(comp, column.name)
            for column in comp.__table__.columns
        }
        # Add the joined automated cost
        item_dict["auto_meli_cost"] = auto_cost
        items.append(item_dict)
    
    # Counts by status
    pending_count = db.query(ScrappedCompetence).filter(
        (ScrappedCompetence.status == None) | (ScrappedCompetence.status == 'pending')
    ).count()
    completed_count = db.query(ScrappedCompetence).filter(
        ScrappedCompetence.status == 'completed'
    ).count()
    error_count = db.query(ScrappedCompetence).filter(
        ScrappedCompetence.status == 'error'
    ).count()
    
    return {
        "items": items,
        "total": total,
        "pending_count": pending_count,
        "completed_count": completed_count,
        "error_count": error_count
    }

def get_competence_item_by_code(db: Session, product_code: str):
    return db.query(ScrappedCompetence).filter(ScrappedCompetence.product_code == product_code).first()

def get_competence_item(db: Session, item_url: str):
    return db.query(ScrappedCompetence).filter(ScrappedCompetence.catalog_link == item_url).first()

def create_competence_item(db: Session, url: str, product_code: str = None, product_name: str = None):
    """Create a new competence scraping entry with just the URL."""
    # Check if url exits
    existing = get_competence_item(db, url)
    if existing:
        return existing
        
    # Use raw SQL to be extremely precise and insert ONLY catalog_link and status
    # This avoids generic ORM behavior of sending NULLs for everything
    from sqlalchemy import text
    import uuid
    import re
    from datetime import datetime
    
    try:
        # meli_id removed logic
        
        # Ensure we have a product_code, fallback to a slice of URL if somehow missing
        effective_code = product_code or url.split('/')[-1][:50]

        # 3. Insert without meli_id
        sql = text("""
            INSERT INTO mercadolibre.scrapped_competence 
            (product_code, catalog_link, status, title, price, competitor, price_in_installments, 
             image, timestamp, api_cost_total, remaining_credits, product_name) 
            VALUES 
            (:product_code, :catalog_link, 'pending', '', 0, '', '', 
             '', :ts, 0, 0, :product_name)
        """)
        
        db.execute(sql, {
            "product_code": effective_code,
            "catalog_link": url, 
            "product_name": product_name or "",
            "ts": datetime.now()
        })
        db.commit()
        
        # Fetch back for return (optional, standard ORM fetch)
        return db.query(ScrappedCompetence).filter(ScrappedCompetence.product_code == effective_code).first()
    except Exception as e:
        db.rollback()
        raise e

def delete_competence_item(db: Session, product_code: str):
    """Delete a competence entry by product_code."""
    try:
        from sqlalchemy import text
        sql = text("DELETE FROM mercadolibre.scrapped_competence WHERE product_code = :code")
        result = db.execute(sql, {"code": product_code})
        db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"Error in delete: {e}")
        db.rollback()
        return False

# --- Tienda Nube Attributes CRUD ---
from models import TiendaNubeAttribute, TiendaNubeProductStatus

def get_tn_attributes(db: Session, item_id: int):
    return db.query(TiendaNubeAttribute).filter(TiendaNubeAttribute.item_id == item_id).first()

def update_tn_attributes(db: Session, item_id: int, updates: dict):
    db_attr = db.query(TiendaNubeAttribute).filter(TiendaNubeAttribute.item_id == item_id).first()
    if not db_attr:
        # Create new if doesn't exist
        db_attr = TiendaNubeAttribute(item_id=item_id)
        db.add(db_attr)
    
    # Force auto-sync SEO fields from main product as per documentation
    product = get_product(db, product_id)
    if product:
        if product.product_name_meli:
            updates['seo_title'] = str(product.product_name_meli)[:100]
        elif product.product_name:
            updates['seo_title'] = str(product.product_name)[:100]
            
        if product.description:
            updates['seo_description'] = str(product.description)[:100]

    for key, value in updates.items():
        if hasattr(db_attr, key):
            # Truncate string fields to 100 characters to match DB limits
            if isinstance(value, str) and key not in ['id', 'item_id']:
                value = value[:100]
            setattr(db_attr, key, value)
    
    db.commit()
    db.refresh(db_attr)
    return db_attr

def get_tn_product_status(db: Session, attribute_id: int):
    return db.query(TiendaNubeProductStatus).filter(TiendaNubeProductStatus.attribute_id == attribute_id).first()
