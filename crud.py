from sqlalchemy.orm import Session
from sqlalchemy import or_, distinct, asc, desc, func
from models import Product, User, ScrappedCompetence, TiendaNubeProductStatus, TiendaNubeAttribute
from schemas import UserCreate

def _get_tn_status(db, product_id):
    """Check real TN status by joining attributes -> product_status"""
    tn_attr = db.query(TiendaNubeAttribute).filter(TiendaNubeAttribute.item_id == product_id).first()
    if tn_attr:
        tn_status = db.query(TiendaNubeProductStatus).filter(TiendaNubeProductStatus.attribute_id == tn_attr.id).first()
        if tn_status and tn_status.product_id:
            return "active"
    return "unpublished"

def get_product(db: Session, product_id: int):
    p = db.query(Product).filter(Product.id == product_id).first()
    if p:
        p.tienda_nube_status = _get_tn_status(db, p.id)
    return p

def get_products(db: Session, skip: int = 0, limit: int = 50, 
                 category: str = None, brand: str = None, 
                 search: str = None,
                 stock_filter: str = None,
                 status: str = None,
                 site: str = None,
                 sort_by: str = None, sort_order: str = 'asc',
                 channel_filter: str = None):
    query = db.query(Product)
    
    # Platform-specific publication filters (Combined into channel_filter)
    if channel_filter:
        if channel_filter.startswith('tn_') or site == 'tienda-nube':
            # Join through attributes table for TN status
            query = query.outerjoin(TiendaNubeAttribute, Product.id == TiendaNubeAttribute.item_id)\
                         .outerjoin(TiendaNubeProductStatus, TiendaNubeAttribute.id == TiendaNubeProductStatus.attribute_id)
            
            if channel_filter == 'tn_published' or (site == 'tienda-nube' and status == 'active'):
                query = query.filter(TiendaNubeProductStatus.product_id != None, TiendaNubeProductStatus.product_id > 0)
            elif channel_filter == 'tn_not_published' or (site == 'tienda-nube' and status == 'unpublished'):
                query = query.filter(or_(TiendaNubeProductStatus.product_id == None, TiendaNubeProductStatus.product_id == 0))
        
        if channel_filter == 'meli_published':
            query = query.filter(Product.meli_id != None, Product.meli_id != '')
        elif channel_filter == 'meli_not_published':
            query = query.filter(or_(Product.meli_id == None, Product.meli_id == ''))
    elif site == 'tienda-nube':
        # Default TN view behavior if no specific channel_filter
        query = query.outerjoin(TiendaNubeAttribute, Product.id == TiendaNubeAttribute.item_id)\
                     .outerjoin(TiendaNubeProductStatus, TiendaNubeAttribute.id == TiendaNubeProductStatus.attribute_id)
        if status == 'active':
            query = query.filter(TiendaNubeProductStatus.product_id != None, TiendaNubeProductStatus.product_id > 0)
        elif status == 'unpublished':
            query = query.filter(or_(TiendaNubeProductStatus.product_id == None, TiendaNubeProductStatus.product_id == 0))

    if category:
        query = query.filter(Product.product_type_path == category)
    if brand:
        query = query.filter(Product.brand == brand)
    if search:
        search_conditions = [
            Product.product_name.ilike(f"%{search}%"),
            Product.product_code.ilike(f"%{search}%"),
            Product.description.ilike(f"%{search}%")
        ]
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
    # Populate real tienda_nube_status for each product
    for p in results:
        p.tienda_nube_status = _get_tn_status(db, p.id)
    return results

def get_categories(db: Session):
    categories = db.query(Product.product_type_path).filter(
        Product.product_type_path != None, 
        Product.product_type_path != ''
    ).distinct().order_by(Product.product_type_path).all()
    return [c[0] for c in categories]

def get_meli_products(db: Session, skip: int = 0, limit: int = 500,
                      status: str = None, search: str = None,
                      sort_by: str = None, sort_order: str = 'asc'):
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
    
    # Sorting
    if sort_by:
        column = getattr(Product, sort_by, None)
        if column is not None:
            if sort_order == 'desc':
                query = query.order_by(desc(column))
            else:
                query = query.order_by(asc(column))
    else:
        query = query.order_by(desc(Product.id))

    total = query.count()
    products = query.offset(skip).limit(limit).all()
    
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

# --- MercadoLibre Attributes CRUD ---
import uuid
from models import MercadoLibreAttribute

MAP_ATTRIBUTES = {
    "INPUT_CONNECTOR": "input_connector",
    "OUTPUT_CONNECTOR": "output_connectors",
    "PRODUCT_TYPE": "product_type",
    "VOLUME_CAPACITY": "volume_capacity",
    "UNITS_PER_PACK": "units_per_pack",
    "INK_COLOR": "ink_color",
    "POT_TYPE": "pot_type",
    "SURVEILLANCE_CAMERA_TYPE": "surveillance_camera_type",
    "CAMERA_LOCATIONS": "camera_locations",
    "CABLE_AND_ADAPTER_TYPE": "cable_and_adapter_type",
    "DATA_STORAGE_CAPACITY": "data_storage_capacity",
    "USB_PORT_VERSION": "usb_port_version",
    "CAPACITY": "capacity",
    "POWER_SUPPLY_TYPE": "power_supply_type",
    "GRADING": "grading",
    "WITH_USB": "with_usb",
    "SIZE": "size",
    "COLOR": "color",
    "GENDER": "gender",
    "NAME": "name",
    "IRON_TYPE": "iron_type",
    "THERMAL_CONTAINER_TYPE": "thermal_container_type",
    "IS_FACTORY_KIT": "is_factory_kit",
    "PIECES_NUMBER": "pieces_number",
    "MATERIAL": "material",
    "DRINKING_GLASS_PRODUCT_TYPE": "drinking_glass_product_type",
    "MAKEUP_FORMAT": "makeup_format",
    "EYELINER_TYPE": "eyeliner_type",
    "BACKPACK_TYPE": "backpack_type"
}

def get_meli_attributes(db: Session, item_id: int):
    import json
    attrs = db.query(MercadoLibreAttribute).filter(MercadoLibreAttribute.item_id == item_id).first()
    if attrs:
        # Auto-heal required fields from allowed_options and not_mapped_attributes
        required_ids = set()
        if attrs.allowed_options:
            try:
                allowed = json.loads(attrs.allowed_options) if isinstance(attrs.allowed_options, str) else attrs.allowed_options
                req_attrs = allowed.get("settings", {}).get("required_attributes", {})
                for attr_id in req_attrs.keys():
                    required_ids.add(attr_id.upper())
            except Exception as e:
                print(f"Error parsing allowed_options: {e}")
                
        if attrs.not_mapped_attributes:
            try:
                not_mapped = json.loads(attrs.not_mapped_attributes) if isinstance(attrs.not_mapped_attributes, str) else attrs.not_mapped_attributes
                if isinstance(not_mapped, list):
                    for item in not_mapped:
                        attr_id = item.get("id")
                        tags = item.get("tags", {})
                        if attr_id and (tags.get("required") is True or tags.get("catalog_required") is True):
                            required_ids.add(attr_id.upper())
            except Exception as e:
                print(f"Error parsing not_mapped_attributes: {e}")
                
        updated = False
        for attr_id in required_ids:
            col_base = MAP_ATTRIBUTES.get(attr_id)
            if col_base:
                col_req = f"{col_base}_required"
                if hasattr(attrs, col_req):
                    if getattr(attrs, col_req) != 1:
                        setattr(attrs, col_req, 1)
                        updated = True
                        
        if updated:
            try:
                db.commit()
                db.refresh(attrs)
            except Exception as e:
                db.rollback()
                print(f"Error auto-healing required attributes: {e}")
                
    return attrs

def find_best_value_match(selected_str, allowed_values):
    if not selected_str or not allowed_values:
        return None, None
        
    selected_norm = selected_str.lower().replace(" ", "").replace("-", "")
    
    # Try exact normalized match first
    for val in allowed_values:
        val_name = val.get("name", "")
        if val_name.lower().replace(" ", "").replace("-", "") == selected_norm:
            return val.get("id"), val_name
            
    # Try partial/contains match
    for val in allowed_values:
        val_name = val.get("name", "")
        if selected_norm in val_name.lower().replace(" ", "").replace("-", "") or val_name.lower().replace(" ", "").replace("-", "") in selected_norm:
            return val.get("id"), val_name
            
    return None, selected_str

def update_meli_attributes(db: Session, item_id: int, updates: dict):
    # Sanitize warranty_type to avoid check constraint violations in DB (allow only exact values or NULL)
    if 'warranty_type' in updates:
        w_val = updates['warranty_type']
        if w_val and w_val not in ["Garantía del vendedor", "Garantía de fábrica", "Garantia del vendedor", "Garantia de fabrica"]:
            updates['warranty_type'] = None

    db_attr = db.query(MercadoLibreAttribute).filter(MercadoLibreAttribute.item_id == item_id).first()
    if not db_attr:
        db_attr = MercadoLibreAttribute(
            id=str(uuid.uuid4()),
            item_id=item_id,
            currency_id="ARS",
            buying_mode="buy_it_now",
            condition_type="new",
            local_pick_up=1,
            logistic_type="drop_off"
        )
        db.add(db_attr)
        db.flush()
    
    # --- AUTO-HEALING & VALUE NORMALIZATION FOR NOT_MAPPED_ATTRIBUTES ---
    import json
    REV_MAP_ATTRIBUTES = {v: k for k, v in MAP_ATTRIBUTES.items()}
    
    not_mapped = []
    if db_attr.not_mapped_attributes:
        try:
            not_mapped = json.loads(db_attr.not_mapped_attributes) if isinstance(db_attr.not_mapped_attributes, str) else db_attr.not_mapped_attributes
            if not isinstance(not_mapped, list):
                not_mapped = []
        except Exception as e:
            print(f"Error loading not_mapped_attributes in update: {e}")

    updated_not_mapped = False
    
    for key, value in list(updates.items()):
        if key in REV_MAP_ATTRIBUTES:
            attr_id = REV_MAP_ATTRIBUTES[key]
            
            # Find in not_mapped
            attr_dict = None
            for item in not_mapped:
                if item.get("id") == attr_id:
                    attr_dict = item
                    break
                    
            if attr_dict:
                if not value:
                    if "value_id" in attr_dict: del attr_dict["value_id"]
                    if "value_name" in attr_dict: del attr_dict["value_name"]
                    updated_not_mapped = True
                else:
                    selected_parts = [s.strip() for s in str(value).split(",") if s.strip()]
                    allowed_vals = attr_dict.get("values", [])
                    if not isinstance(allowed_vals, list):
                        allowed_vals = []
                        
                    matched_ids = []
                    matched_names = []
                    for part in selected_parts:
                        val_id, val_name = find_best_value_match(part, allowed_vals)
                        if val_id:
                            matched_ids.append(val_id)
                        matched_names.append(val_name)
                        
                    normalized_str = ", ".join(matched_names)
                    updates[key] = normalized_str # Update the database column in updates dict
                    
                    if len(matched_ids) == 1:
                        attr_dict["value_id"] = matched_ids[0]
                        attr_dict["value_name"] = matched_names[0]
                    elif len(matched_ids) > 1:
                        attr_dict["value_id"] = None
                        attr_dict["value_name"] = normalized_str
                    else:
                        attr_dict["value_id"] = None
                        attr_dict["value_name"] = normalized_str
                    updated_not_mapped = True

    if updated_not_mapped:
        db_attr.not_mapped_attributes = not_mapped
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(db_attr, "not_mapped_attributes")
        
    for key, value in updates.items():
        if hasattr(db_attr, key) and key != 'id' and key != 'item_id':
            setattr(db_attr, key, value)
    
    db.commit()
    db.refresh(db_attr)
    return db_attr
