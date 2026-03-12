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
TOKEN_JSON_FILE = "token.json"
TOKEN_B64_FILE = "token.b64"

@router.get("/auth-url")
def get_auth_url(request: Request):
    if not os.path.exists(CLIENT_SECRETS_FILE):
        raise HTTPException(status_code=404, detail="client_secret.json not found on server")

    # Determine redirect URI dynamically or use a fixed one
    # For Cloud Run, we must ensure it's authorized in Google Console.
    # Usually it's https://vuestro-dominio.com/api/drive/callback
    host = request.headers.get("host")
    protocol = "https" if "https" in str(request.url.scheme) or "inventory-app" in host else "http"
    redirect_uri = f"{protocol}://{host}/api/drive/callback"

    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )

    return {"auth_url": auth_url}

@router.get("/callback")
def auth_callback(request: Request, code: str):
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    host = request.headers.get("host")
    protocol = "https" if "https" in str(request.url.scheme) or "inventory-app" in host else "http"
    redirect_uri = f"{protocol}://{host}/api/drive/callback"

    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )

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
        
        # Redirect back to settings with a success param
        return RedirectResponse(url="/#settings?auth=success")
        
    except Exception as e:
        print(f"ERROR in Drive auth callback: {e}")
        return RedirectResponse(url="/#settings?auth=error")
