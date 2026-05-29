# Deployment & Setup Guide

This guide details the step-by-step configuration required to compile, initialize, and deploy the ImportFull Inventory system to both local environments and Google Cloud Run.

---

## 📋 Prerequisites

Before proceeding, ensure you have:
1. **Python 3.10+** (if deploying locally or debugging scripts).
2. A **Google Cloud Project** with the following APIs enabled:
   - Cloud Run API
   - Cloud SQL Admin API
   - Google Drive API
3. A **PostgreSQL instance** on Google Cloud SQL (or local database instance).
4. **Google Drive API Credentials** configured via the Google Cloud Console (OAuth Client IDs or Service Account keys).

---

## 🔐 1. Environment Variables Configuration

The backend relies on environment variables for security credentials. Avoid checking these secrets into version control.

| Environment Variable | Description | Example / Default Value |
| :--- | :--- | :--- |
| `DB_USER` | PostgreSQL Username | `postgres` |
| `DB_PASS` | PostgreSQL Password | `my_secure_password` |
| `DB_NAME` | PostgreSQL Database Name | `inventory_db` |
| `DB_HOST` | Database Host (leave blank for local SQLite) | `10.24.96.3` or Unix Socket Path |
| `ROOT_DRIVE_FOLDER_ID` | Base Folder ID on Google Drive for assets | `1dd2P6OkaFgvkah-sBr_sjagAnCk31n-v` |
| `LOGOS_FOLDER_ID` | Folder ID dedicated for Light/Dark Logos | `1dd2P6OkaFgvkah-sBr_sjagAnCk31n-v` |
| `GOOGLE_CLIENT_SECRET_JSON` | base64-encoded `client_secret.json` content | `eyJ3ZWIiOnsiY2xpZW50X2lkIjo...` |
| `GOOGLE_DRIVE_REFRESH_TOKEN`| Long-lived OAuth2 Refresh Token (Skip OAuth screen) | `1//04hW1kS7V9S8...` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google Service Account JSON file (optional fallback) | `/secrets/google/sa_credentials.json` |

---

## 🗄️ 2. Database Initialization

The application automatically checks for connection parameters. If `DB_HOST` is omitted, it defaults to a local **SQLite** database (`inventory.db`).

### Running DB Schema Migrations

To apply database tables and columns dynamically, use the built-in initialization scripts:

1. **Local SQLite Initialization**:
   ```bash
   python init_local_sqlite.py
   ```

2. **Remote Cloud SQL PostgreSQL Initialization**:
   ```bash
   python init_remote_db.py
   ```

3. **Schema Schema Fixes** (reconciles missing competitor column attributes):
   ```bash
   python init_competence_db.py
   ```

*Note: Migrations can also be completed via SQL scripts directly on the PostgreSQL instance using `manual_remote_fix.sql`.*

---

## ☁️ 3. Deploying to Google Cloud Run

The application is fully containerized and configured for Google Cloud Run deployment using the provided `Dockerfile` and `cloudbuild.yaml`.

### Step 3.1: Build Container Image via Cloud Build
Build and submit the Docker container to the Google Container Registry:
```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=_LOCATION="us-central1",_REPOSITORY="inventory-repo",_IMAGE="importfull-inventory"
```

### Step 3.2: Deploy to Google Cloud Run
Deploy the compiled container image using `service.yaml` or via the CLI:
```bash
gcloud run deploy importfull-inventory \
  --image us-central1-docker.pkg.dev/your-project-id/inventory-repo/importfull-inventory:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DB_USER="postgres",DB_NAME="inventory_db" \
  --add-cloudsql-instances="your-project-id:us-central1:your-db-instance"
```

---

## 📂 4. Google Drive Integration Setup

To allow image uploads and logo persistence:

1. Go to the **Google Cloud Console** -> **APIs & Services** -> **Credentials**.
2. Create an **OAuth 2.0 Client ID** (Type: *Web Application* or *Desktop Application*).
3. Download the JSON configuration file, rename it to `client_secret.json`, and place it in the application's root directory.
4. **Authorize Drive access**:
   - Access the system settings dashboard, navigate to the **Google Drive Integration** card, click **Autorizar con Google** and complete the consent screen.
   - Alternatively, inject `GOOGLE_DRIVE_REFRESH_TOKEN` as an environment variable to bypass interactive authorization.
