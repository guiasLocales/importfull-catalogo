import os
import json
import base64
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
# import main  # Removed to fix circular import

router = APIRouter(prefix="/api/drive", tags=["drive-auth"])

# Constants
CLIENT_SECRETS_FILE = "client_secret.json"
SCOPES = ['https://www.googleapis.com/auth/drive']

# Use /tmp for token storage in Cloud Run (read-only filesystem)
if os.getenv('K_SERVICE') or os.name != 'nt':
    TOKEN_JSON_FILE = "/tmp/token.json"
    TOKEN_B64_FILE = "/tmp/token.b64"
else:
    TOKEN_JSON_FILE = "token.json"
    TOKEN_B64_FILE = "token.b64"

def get_client_config():
    env_json = os.environ.get("GOOGLE_CLIENT_SECRET_JSON")
    if env_json:
        try:
            return json.loads(env_json)
        except Exception as e:
            print(f"ERROR: Failed to parse GOOGLE_CLIENT_SECRET_JSON env var: {e}")
    
    if os.path.exists(CLIENT_SECRETS_FILE):
        with open(CLIENT_SECRETS_FILE, 'r') as f:
            return json.load(f)
    
    return None

@router.get("/auth-url")
def get_auth_url(request: Request):
    client_config = get_client_config()
    if not client_config:
        raise HTTPException(status_code=404, detail="client_secret.json not found on server and env var not set")

    # Determine redirect URI dynamically
    host = request.headers.get("host", "")
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    
    # Force HTTPS for Cloud Run or when specifically on the inventory-app domain
    is_cloud_run = os.getenv('K_SERVICE') is not None
    is_inventory_host = "inventory-app" in host or ".run.app" in host
    
    protocol = "https" if forwarded_proto == "https" or is_cloud_run or is_inventory_host else "http"
    
    # Security: If not localhost, always prefer https for OAuth
    if "localhost" not in host and "127.0.0.1" not in host:
        protocol = "https"

    redirect_uri = f"{protocol}://{host}/api/drive/callback"
    print(f"DEBUG: Generating Auth URL with redirect_uri: {redirect_uri}")
    
    # Required for some OAuth libraries when behind proxies
    if protocol == "https":
        os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )

    auth_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    
    response = JSONResponse(content={"auth_url": auth_url})
    # Store PKCE code_verifier securely in a cookie (Solves stateless Cloud Run instance switching)
    if hasattr(flow, 'code_verifier'):
        response.set_cookie(
            key="oauth_cv", 
            value=flow.code_verifier, 
            httponly=True, 
            secure=True, 
            samesite="lax",
            max_age=600 # 10 minutes
        )

    return response

@router.get("/callback")
def auth_callback(request: Request, code: str, state: str = None):
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    client_config = get_client_config()
    if not client_config:
        raise HTTPException(status_code=404, detail="client_secret.json not found and env var not set")

    host = request.headers.get("host", "")
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    
    is_cloud_run = os.getenv('K_SERVICE') is not None
    is_inventory_host = "inventory-app" in host or ".run.app" in host
    
    protocol = "https" if forwarded_proto == "https" or is_cloud_run or is_inventory_host else "http"
    
    if "localhost" not in host and "127.0.0.1" not in host:
        protocol = "https"
        
    redirect_uri = f"{protocol}://{host}/api/drive/callback"
    print(f"DEBUG: Callback using redirect_uri: {redirect_uri}")

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        state=state
    )
    
    # Recover PKCE code_verifier from the browser cookie
    cv_cookie = request.cookies.get("oauth_cv")
    if cv_cookie:
        flow.code_verifier = cv_cookie

    try:
        flow.fetch_token(code=code)
        creds = flow.credentials
        
        # Save token.json
        creds_json = creds.to_json()
        with open(TOKEN_JSON_FILE, "w") as f:
            f.write(creds_json)
        
        # Save token.b64
        token_b64 = base64.b64encode(creds_json.encode('utf-8')).decode('utf-8')
        with open(TOKEN_B64_FILE, "w") as f:
            f.write(token_b64)
            
        print(f"DEBUG: Successfully updated {TOKEN_JSON_FILE} and {TOKEN_B64_FILE} via web flow")
        
        # Guardar en base de datos de manera persistente
        try:
            from db_conn import engine
            from sqlalchemy import text
            with engine.begin() as conn:
                try:
                    conn.execute(text("ALTER TABLE inventory_users ADD COLUMN drive_token_b64 TEXT"))
                except:
                    pass # Column might already exist
                conn.execute(
                    text("UPDATE inventory_users SET drive_token_b64 = :token WHERE username = 'admin' OR role = 'admin'"),
                    {"token": token_b64}
                )
            print("DEBUG: Token saved persistently to the database!")
        except Exception as db_err:
            print(f"DEBUG: Could not save token to DB: {db_err}")
        
        # Redirect back to settings with a success param
        return RedirectResponse(url="/#settings?auth=success")
        
    except Exception as e:
        error_msg = str(e).replace(' ', '_')
        print(f"ERROR in Drive auth callback: {e}")
        # Send error message in URL for debugging
        return RedirectResponse(url=f"/#settings?auth=error&info={error_msg[:100]}")

@router.get("/debug")
def debug_drive_config():
    """Diagnostic endpoint to check if env vars are loaded correctly"""
    client_config = get_client_config()
    refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")
    
    debug_info = {
        "GOOGLE_DRIVE_REFRESH_TOKEN_exists": refresh_token is not None,
        "GOOGLE_DRIVE_REFRESH_TOKEN_length": len(refresh_token) if refresh_token else 0,
        "GOOGLE_DRIVE_REFRESH_TOKEN_prefix": refresh_token[:5] if refresh_token else None,
        "GOOGLE_CLIENT_SECRET_JSON_exists": os.getenv("GOOGLE_CLIENT_SECRET_JSON") is not None,
        "client_config_parsed": client_config is not None,
    }
    
    if client_config:
        config = client_config.get('web') or client_config.get('installed')
        debug_info["config_type"] = "web" if 'web' in client_config else ("installed" if 'installed' in client_config else "unknown")
        if config:
            debug_info["client_id_exists"] = config.get('client_id') is not None
            debug_info["client_id_prefix"] = config.get('client_id')[:15] if config.get('client_id') else None
    
    return debug_info
