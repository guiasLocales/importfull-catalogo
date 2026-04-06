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
    host = request.headers.get("host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    protocol = "https" if forwarded_proto == "https" or "inventory-app" in host else "http"
    redirect_uri = f"{protocol}://{host}/api/drive/callback"
    
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

    host = request.headers.get("host")
    protocol = "https" if "https" in str(request.url.scheme) or "inventory-app" in host else "http"
    redirect_uri = f"{protocol}://{host}/api/drive/callback"

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
        
        # Redirect back to settings with a success param
        return RedirectResponse(url="/#settings?auth=success")
        
    except Exception as e:
        error_msg = str(e).replace(' ', '_')
        print(f"ERROR in Drive auth callback: {e}")
        # Send error message in URL for debugging
        return RedirectResponse(url=f"/#settings?auth=error&info={error_msg[:100]}")
