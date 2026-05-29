# ImportFull Inventory Management System

Welcome to the **ImportFull Inventory Management System**, a high-performance, multichannel inventory manager designed to bridge local operations, MercadoLibre, and Tienda Nube sales channels with real-time syncing, competitive analysis, and AI-assisted content optimization.

This application is built with a **FastAPI** backend, a **SQLAlchemy** ORM layer supporting dynamic PostgreSQL/SQLite failover, and a **Vanilla HTML5/CSS/JavaScript** frontend enriched with premium UI aesthetics and Lucide icons.

---

## 🚀 System Architecture

The application implements a hybrid architectural model, combining localized operations with robust cloud database infrastructure and external API proxying.

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend [Presentation Layer (HTML5 / Vanilla JS / CSS)]
        UI[Desktop & Mobile Web Console]
        JS_App[app.v124.js - Global App Routing]
        JS_TN[tienda-nube.js - TN Operations]
        JS_Logo[logo-drive.js - Logo Uploader]
    end

    %% Backend Layer
    subgraph Backend [FastAPI Application Server]
        API[FastAPI Router Engine]
        DB_Conn[db_conn.py - Dual-Engine Connection Manager]
        CRUD[crud.py - SQL Data Access Layer]
        
        subgraph Services [Service Layer]
            Drive[drive_service.py - Google Drive API Client]
            Settings[settings_service.py - Drive Config Manager]
        end
    end

    %% Storage Layer
    subgraph Storage [Persistence & Storage Layer]
        CloudSQL[(Google Cloud SQL PostgreSQL)]
        SQLite[(Local inventory.db SQLite Fallback)]
    end

    %% External Systems
    subgraph External [External APIs & Webhooks]
        MeliAPI[MercadoLibre API & Webhooks]
        TNApi[Tienda Nube API]
        GDriveAPI[Google Drive File System]
        CalcWebhook[External Selling Cost Calculator Webhook]
    end

    %% Connections
    UI <--> JS_App
    UI <--> JS_TN
    UI <--> JS_Logo
    
    JS_App <--> API
    JS_TN <--> API
    JS_Logo <--> API
    
    API <--> CRUD
    API <--> Services
    
    CRUD <--> DB_Conn
    DB_Conn <--> CloudSQL
    DB_Conn <--> SQLite
    
    Services <--> GDriveAPI
    API <--> MeliAPI
    API <--> TNApi
    API <--> CalcWebhook
```

---

## ✨ Core Features

1. **Multichannel Syncing & Inventory Control**
   - Seamlessly connect and synchronize stocks, descriptions, pricing, and statuses across **MercadoLibre** and **Tienda Nube**.
   - Dual-state management: maintain independent retail listings and wholesale catalog items.

2. **Automated Competitor Scraping & Financial Calculator**
   - Keep track of market prices by scraping competitor listings in real time.
   - Built-in financial calculator for net margins, markups, commission values, and shipping costs, accounting for estimated return rates and packaging fees.

3. **AI-Powered Pre-Publishing Optimizer**
   - Instantly optimize product titles and descriptions for search relevance using generative AI endpoints.
   - Fine-tune prompt settings directly from the management console.

4. **Audit & Publication Quality Dashboard**
   - Fetch real-time quality and performance scores from MercadoLibre.
   - Detailed rule audit showing improvement instructions and quick-fix links.

5. **Google Drive Asset Hosting**
   - Direct image integration: upload product images and corporate logos directly to Google Drive.
   - Automatic proxy server to stream, cache, and display assets securely without exposing OAuth credentials.

6. **Hybrid Database Resilience (Cloud SQL + SQLite)**
   - Automatically fall back to a local SQLite database (`inventory.db`) if Cloud SQL connection strings are unavailable, ensuring continuous local runtime availability.

---

## 📂 Project Directory Structure

```text
importfull-inventory/
├── main.py                     # Application entry point and static/media mount configs
├── db_conn.py                  # Dual db engine (Cloud SQL / SQLite) fallback initiator
├── models.py                   # SQLAlchemy Database Schema Declarations
├── schemas.py                  # Pydantic validation models and DTOs
├── crud.py                     # DB CRUD transaction controllers
├── requirements.txt            # Python production dependencies
├── Dockerfile                  # Container build recipe
├── cloudbuild.yaml             # Google Cloud Build pipeline configuration
├── service.yaml                # Google Cloud Run service schema
│
├── routers/                    # FastAPI Backend API Routers
│   ├── auth.py                 # JWT token administration & Logo Upload handlers
│   ├── products.py             # Product listings, publishing, and webhooks
│   ├── competence.py           # Competitor scraping routes and permissions
│   ├── drive_auth.py           # OAuth2 Google Drive tokens and database storage
│   ├── selling.py              # Outbound Selling calculations and webhook relays
│   ├── performance.py          # MercadoLibre Quality scoring and audit rows
│   ├── prompts.py              # Prompt templates configuration
│   └── metadata.py             # Helper queries (categories, brands)
│
├── services/                   # Business Logic & Third-Party Wrappers
│   ├── drive_service.py        # Google Drive API connector (User & SA credentials)
│   └── settings_service.py     # JSON settings persistence over Google Drive
│
├── static/                     # Presentation assets (UI)
│   ├── index.html              # Main user console SPA dashboard layout
│   ├── css/
│   │   └── style.css           # Premium Vanilla CSS styling, light/dark custom styles
│   └── js/
│       ├── app.v124.js         # Navigation, inline editors, details view, Meli module
│       ├── tienda-nube.js      # Tienda Nube module, server-side sorting, listings
│       ├── logo-drive.js       # Logo upload event handlers and favicon application
│       └── utils.js            # Standard formatters and shared functions
│
└── migrations/                 # DB schema version history scripts
```

---

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python 3.10+), SQLAlchemy (ORM), Alembic, Pydantic, HTTPX, PyJWT.
- **Frontend**: HTML5, Vanilla JavaScript (ES6 Modules), CSS3 Variables (Custom Styling), Lucide Icons, Google Fonts (Inter).
- **Hosting/Infrastructure**: Google Cloud Run, Cloud SQL (PostgreSQL), Google Drive API.
