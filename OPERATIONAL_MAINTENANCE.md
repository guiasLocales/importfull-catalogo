# Operational Maintenance Guide

This manual outlines routine maintenance procedures, diagnostic tools, token refresh steps, and troubleshooting workflows for the system administrators of ImportFull Inventory.

---

## 🔑 1. Google Drive Token Refresh

Google Drive API OAuth tokens expire periodically. The application uses a hybrid storage model for tokens (base64 DB record, local file system `token.json`, and environment variables).

### Resolving "Drive Authorization Expired"

If users receive credential errors during asset uploads:

1. **Local Dev Token Refresh**:
   Run the local token refresh script:
   ```bash
   python refresh_token_local.py
   ```
   This opens a browser window for Google Account sign-in. It will output a refreshed `token.json` and a base64 encoded token.

2. **Server-Side Recovery**:
   - Log in to the management dashboard.
   - Go to the **Google Drive Integration** configuration card.
   - Click **Autorizar con Google**.
   - Authenticate with the authorized Google Workspace account.
   - The token will be updated automatically in the `inventory_users` table under the `drive_token_b64` column and synchronized across all Cloud Run instances.

---

## 🗄️ 2. Database Migrations & Diagnostics

If database schemas drift or new columns are required in production:

### Run Diagnostic Scripts

* **Check Database Connectivity & Tables**:
  ```bash
  python check_db.py
  ```
  Verifies connection parameters and list table counts.

* **List Database Columns per Table**:
  ```bash
  python check_columns.py
  ```
  Lists all columns in PostgreSQL to detect discrepancies.

* **Verify Cloud Data Records**:
  ```bash
  python check_cloud_data.py
  ```

### Adding Missing Columns Dynamically
To add missing columns to existing database tables (such as Google Drive link attributes or competitor cost variables) without running standard SQL console inputs:
```bash
python add_all_missing_columns.py
```
This script dynamically inspects the active models defined in `models.py` against the physical PostgreSQL instance and runs the appropriate `ALTER TABLE` statements safely.

---

## 🌐 3. Competitor Scraping Maintenance

Monitored listings are scraped on a scheduled basis or triggered manually by administrators.

### Triggering Manual Global Scraping
Administrators can run scraping immediately using:
```bash
python seed_data.py
```
This initializes core prompt configs and triggers scraper threads.

Alternatively, users can click **Iniciar Scrapping Global** directly in the Competence view of the web console, which triggers the `/api/competence/start-scraping` API router endpoint.

---

## 🔎 4. Utility Scripts Reference Directory

The repository includes several purpose-built CLI utilities for maintenance and diagnostics:

| Utility Script | Primary Purpose |
| :--- | :--- |
| `verify_setup.py` | Runs diagnostic loops across database, credentials, and network bindings. |
| `list_drive_folders.py` | Connects to Drive API and lists folders under `ROOT_FOLDER_ID` for validation. |
| `diagnose_drive.py` | Troubleshoots permission levels and folder ownership structures. |
| `reset_admin.py` | Overwrites the admin credentials in the database to restore access. |
| `check_performance_db.py` | Queries performance and quality score tables to verify Meli API response storage. |
| `get_tokens.py` | Extracts stored Base64 token parameters from the SQLite/PostgreSQL instances. |
