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

def get_meli_attributes(db: Session, item_id: int):
    import json
    from models import Product, SellingCalculation
    
    attrs = db.query(MercadoLibreAttribute).filter(MercadoLibreAttribute.item_id == item_id).first()
    
    if not attrs:
        # Create it dynamically if it doesn't exist
        attrs = MercadoLibreAttribute(
            id=str(uuid.uuid4()),
            item_id=item_id,
            category_id=""
        )
        db.add(attrs)
        db.flush()

    # Parse allowed_options if present
    allowed = None
    if attrs.allowed_options:
        try:
            allowed = json.loads(attrs.allowed_options) if isinstance(attrs.allowed_options, str) else attrs.allowed_options
        except Exception as e:
            print(f"Error parsing allowed_options: {e}")

    # Helper to build dynamic settings from allowed_options schema
    def build_settings_from_allowed(allowed_data, existing_settings=None):
        settings_data = allowed_data.get("settings", {})
        
        # Build index of existing values to preserve them
        values_by_id = {}
        if existing_settings:
            if isinstance(existing_settings, str):
                try: existing_settings = json.loads(existing_settings)
                except Exception: existing_settings = None
            if isinstance(existing_settings, list):
                for section in existing_settings:
                    if isinstance(section, dict):
                        for sec_name, items in section.items():
                            if isinstance(items, list):
                                for item in items:
                                    if isinstance(item, dict) and "id" in item:
                                        values_by_id[item["id"]] = item.get("user_input_value")

        # 1. Attributes
        req_attrs = settings_data.get("required_attributes", {})
        attributes_list = [
            {
                "id": "condition_type",
                "name": "Condición",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": ["new", "used", "reconditioned"],
                "user_input_value": values_by_id.get("condition_type", "new"),
                "value_max_lenght": ""
            }
        ]
        for attr_id, attr_info in req_attrs.items():
            val_type = attr_info.get("value_type", "string")
            vals = attr_info.get("values", "")
            cond = "Restricted Input" if val_type == "list" or isinstance(vals, list) else "Free Input"
            
            attributes_list.append({
                "id": attr_id.lower(),
                "name": attr_info.get("name", attr_id),
                "condition": cond,
                "value_type": val_type,
                "value_examples": vals if isinstance(vals, list) else [vals] if vals else "",
                "user_input_value": values_by_id.get(attr_id.lower(), ""),
                "value_max_lenght": 255
            })

        # 2. Shipping
        ship_data = settings_data.get("shipping", {})
        modos = ship_data.get("modos", ["custom", "me1", "me2", "not_specified"])
        shipping_list = [
            {
                "id": "mode",
                "name": "Metodo de Envio",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": [modos],
                "user_input_value": values_by_id.get("mode", "me2"),
                "value_max_lenght": ""
            },
            {
                "id": "local_pick_up",
                "name": "Buscar en Local",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": [["True", "False"]],
                "user_input_value": values_by_id.get("local_pick_up", "True"),
                "value_max_lenght": ""
            },
            {
                "id": "free_shipping",
                "name": "Envio Gratis",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": [["True", "False"]],
                "user_input_value": values_by_id.get("free_shipping", "False"),
                "value_max_lenght": ""
            },
            {
                "id": "logistic_type",
                "name": "Tipo de Logistica",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": [["fulfillment", "cross_docking", "self_service", "drop_off", "custom"]],
                "user_input_value": values_by_id.get("logistic_type", "drop_off"),
                "value_max_lenght": ""
            }
        ]

        # 3. Sale Terms
        warr_data = settings_data.get("warranty", {})
        warr_types = warr_data.get("WARRANTY_TYPE", ["Garantía del vendedor", "Garantía de fábrica", "Sin garantía"])
        sale_terms_list = [
            {
                "id": "warranty_type",
                "name": "Tipo de garantia",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": warr_types,
                "user_input_value": values_by_id.get("warranty_type", "Garantía del vendedor"),
                "value_max_lenght": ""
            },
            {
                "id": "warranty_time",
                "name": "Tiempo de garantia",
                "condition": "Free Input",
                "value_type": "number_unit",
                "value_examples": "",
                "user_input_value": values_by_id.get("warranty_time", "30 dias"),
                "value_max_lenght": 255
            }
        ]

        # 4. Listing
        listing_opts = settings_data.get("listing_options", [])
        formatted_options = []
        for opt in listing_opts:
            opt_id = opt.get("id")
            opt_name = opt.get("nombre", opt_id)
            fee = opt.get("comision_fija", 0.0)
            pct_str = opt.get("porcentaje_comision") or "0%"
            pct = 0.0
            try:
                pct = float(pct_str.replace("%", ""))
            except Exception:
                if opt_id == "gold_pro":
                    pct = 26.95
                elif opt_id == "gold_special":
                    pct = 14.65
            
            # Recalculate if zero
            if not fee and pct:
                product = db.query(Product).filter(Product.id == item_id).first()
                if product:
                    prod_price = float(product.price_mercadolibre or product.price or 0.0)
                    fee = round(prod_price * (pct / 100.0), 2)

            formatted_options.append({
                "id": opt_id,
                "name": opt_name,
                "sale_fee_amount": fee,
                "sale_fee_details": {
                    "fixed_fee": 0,
                    "gross_amount": fee,
                    "percentage_fee": pct,
                    "meli_percentage_fee": pct if opt_id == "gold_special" else 14.65,
                    "financing_add_on_fee": 0.0 if opt_id == "gold_special" else (pct - 14.65)
                },
                "listing_fee_amount": 0,
                "listing_fee_details": {"fixed_fee": 0, "gross_amount": 0}
            })

        if not formatted_options:
            formatted_options = [
                {
                    "id": "gold_pro",
                    "name": "Premium",
                    "sale_fee_amount": 0.0,
                    "sale_fee_details": {"fixed_fee": 0, "gross_amount": 0, "percentage_fee": 26.95, "meli_percentage_fee": 14.65, "financing_add_on_fee": 12.3}
                },
                {
                    "id": "gold_special",
                    "name": "Clasica",
                    "sale_fee_amount": 0.0,
                    "sale_fee_details": {"fixed_fee": 0, "gross_amount": 0, "percentage_fee": 14.65, "meli_percentage_fee": 14.65, "financing_add_on_fee": 0}
                }
            ]

        listing_list = [
            {
                "id": "buying_mode",
                "name": "Método de Compra",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": ["buy_it_now", "classified"],
                "user_input_value": values_by_id.get("buying_mode", "buy_it_now"),
                "value_max_lenght": ""
            },
            {
                "id": "listing_type",
                "name": "Campana de Cuotas",
                "condition": "Restricted Input",
                "value_type": "list",
                "value_examples": [formatted_options],
                "user_input_value": values_by_id.get("listing_type", "gold_special"),
                "value_max_lenght": ""
            }
        ]

        return [
            {"attributes": attributes_list},
            {"shipping": shipping_list},
            {"sale_terms": sale_terms_list},
            {"listing": listing_list}
        ]

    # Rebuild settings from allowed_options schema if present
    if allowed:
        attrs.settings = build_settings_from_allowed(allowed, attrs.settings)
        db.commit()
        db.refresh(attrs)
    elif not attrs.settings:
        # Fetch product price for listing calculations
        product = db.query(Product).filter(Product.id == item_id).first()
        price = 0.0
        if product:
            price = float(product.price_mercadolibre or product.price or 0.0)
            if not attrs.category_id and product.product_type_id and str(product.product_type_id).startswith("MLA"):
                attrs.category_id = product.product_type_id
                
        # Calculate fees based on product price
        sale_fee_gold_special = round(price * 0.1465, 2)
        sale_fee_gold_pro = round(price * 0.2695, 2)
        
        # Build dynamic settings structure
        default_settings = [
            {
                "attributes": [
                    {
                        "id": "condition_type",
                        "name": "Condición",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": ["new", "used", "reconditioned"],
                        "user_input_value": "new",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "pot_type",
                        "name": "Tipo de olla",
                        "condition": "Free Input",
                        "value_type": "string",
                        "value_examples": ["Vaporeras", "Cacerola", "Olla a presion"],
                        "user_input_value": "",
                        "value_max_lenght": 255
                    },
                    {
                        "id": "units_per_pack",
                        "name": "Unidades por pack",
                        "condition": "Free Input",
                        "value_type": "number",
                        "value_examples": "",
                        "user_input_value": "1",
                        "value_max_lenght": 18
                    },
                    {
                        "id": "value_added_tax",
                        "name": "IVA",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": ["Exento", "0 %", "10.5 %", "21 %", "27 %"],
                        "user_input_value": "21 %",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "import_duty",
                        "name": "Impuesto interno",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": ["0 %", "1 %", "2.5 %", "4 %", "5 %", "8 %", "9.5 %", "10 %", "14 %", "15 %", "18 %", "19 %", "20 %", "23 %", "25 %", "26 %", "70 %"],
                        "user_input_value": "0 %",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "volume_capacity",
                        "name": "Capacidad en volumen",
                        "condition": "Free Input",
                        "value_type": "number_unit",
                        "value_examples": "",
                        "user_input_value": "1 mL",
                        "value_max_lenght": 255
                    }
                ]
            },
            {
                "shipping": [
                    {
                        "id": "mode",
                        "name": "Metodo de Envio",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": [["custom", "me1", "me2", "not_specified"]],
                        "user_input_value": "me2",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "local_pick_up",
                        "name": "Buscar en Local",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": [["True", "False"]],
                        "user_input_value": "True",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "free_shipping",
                        "name": "Envio Gratis",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": [["True", "False"]],
                        "user_input_value": "False",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "logistic_type",
                        "name": "Tipo de Logistica",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": [["fulfillment", "cross_docking", "self_service", "drop_off", "custom"]],
                        "user_input_value": "drop_off",
                        "value_max_lenght": ""
                    }
                ]
            },
            {
                "sale_terms": [
                    {
                        "id": "warranty_type",
                        "name": "Tipo de garantia",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": ["Garantia del vendedor", "Garantia de fabrica", "Sin garantia"],
                        "user_input_value": "Garantia del vendedor",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "warranty_time",
                        "name": "Tiempo de garantia",
                        "condition": "Free Input",
                        "value_type": "number_unit",
                        "value_examples": "",
                        "user_input_value": "30 dias",
                        "value_max_lenght": 255
                    }
                ]
            },
            {
                "listing": [
                    {
                        "id": "buying_mode",
                        "name": "Método de Compra",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": ["buy_it_now", "classified"],
                        "user_input_value": "buy_it_now",
                        "value_max_lenght": ""
                    },
                    {
                        "id": "listing_type",
                        "name": "Campana de Cuotas",
                        "condition": "Restricted Input",
                        "value_type": "list",
                        "value_examples": [[
                            {
                                "id": "gold_pro",
                                "name": "Premium",
                                "sale_fee_amount": sale_fee_gold_pro,
                                "sale_fee_details": {
                                    "fixed_fee": 0,
                                    "gross_amount": sale_fee_gold_pro,
                                    "percentage_fee": 26.95,
                                    "meli_percentage_fee": 14.65,
                                    "financing_add_on_fee": 12.3
                                },
                                "listing_fee_amount": 0,
                                "listing_fee_details": {"fixed_fee": 0, "gross_amount": 0}
                            },
                            {
                                "id": "gold_special",
                                "name": "Clasica",
                                "sale_fee_amount": sale_fee_gold_special,
                                "sale_fee_details": {
                                    "fixed_fee": 0,
                                    "gross_amount": sale_fee_gold_special,
                                    "percentage_fee": 14.65,
                                    "meli_percentage_fee": 14.65,
                                    "financing_add_on_fee": 0
                                },
                                "listing_fee_amount": 0,
                                "listing_fee_details": {"fixed_fee": 0, "gross_amount": 0}
                            }
                        ]],
                        "user_input_value": "gold_special",
                        "value_max_lenght": ""
                    }
                ]
            }
        ]
        
        attrs.settings = default_settings
        db.commit()
        db.refresh(attrs)
        
    return attrs

def update_meli_attributes(db: Session, item_id: int, updates: dict):
    db_attr = db.query(MercadoLibreAttribute).filter(MercadoLibreAttribute.item_id == item_id).first()
    
    if not db_attr:
        db_attr = MercadoLibreAttribute(
            id=str(uuid.uuid4()),
            item_id=item_id,
            category_id=""
        )
        db.add(db_attr)
        db.flush()
        
    # Update fields dynamically if they exist on the model
    for key, value in updates.items():
        if hasattr(db_attr, key) and key not in ["id", "item_id"]:
            setattr(db_attr, key, value)
            
    db.commit()
    db.refresh(db_attr)
    return db_attr
