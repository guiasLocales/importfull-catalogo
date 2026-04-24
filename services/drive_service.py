import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

# SCOPES required for Drive access
SCOPES = ['https://www.googleapis.com/auth/drive']
CLIENT_SECRET_FILE = 'client_secret.json'

# Use /tmp for token storage in Cloud Run (read-only filesystem)
if os.getenv('K_SERVICE') or os.name != 'nt':
    TOKEN_FILE = '/tmp/token.json'
    RUNTIME_TOKEN_FILE = '/tmp/token.json'
else:
    TOKEN_FILE = 'token.json'
    RUNTIME_TOKEN_FILE = '/tmp/token.json' # Always use /tmp for runtime behavior

# ROOT FOLDER ID: Get from Env Var or use default
ROOT_FOLDER_ID = os.getenv('ROOT_DRIVE_FOLDER_ID', "1dd2P6OkaFgvkah-sBr_sjagAnCk31n-v")

def get_drive_service():
    """Builds and returns the Drive service."""
    creds = None
    # SCOPES must strictly match the ones authorized in OAuth Playground
    SCOPES = ['https://www.googleapis.com/auth/drive']
    
    # Use /tmp for token storage in Cloud Run
    RUNTIME_TOKEN_FILE = '/tmp/token.json'
    
    # 0. Priority: Permanent Refresh Token from Environment Variable
    # This is the most reliable method for headless servers/Cloud Run
    refresh_token = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")
    if refresh_token:
        refresh_token = refresh_token.strip()
        try:
            from routers.drive_auth import get_client_config
            client_config = get_client_config()
            
            if client_config:
                config = client_config.get('web') or client_config.get('installed')
                if config:
                    print(f"DEBUG: Attempting login with Permanent Refresh Token (Client: {config.get('client_id')[:10]}...)", flush=True)
                    creds = Credentials(
                        token=None,
                        refresh_token=refresh_token,
                        token_uri=config.get('token_uri', "https://oauth2.googleapis.com/token"),
                        client_id=config.get('client_id'),
                        client_secret=config.get('client_secret'),
                        scopes=SCOPES
                    )
                    
                    # Force a refresh to verify it works
                    creds.refresh(Request())
                    
                    if creds and creds.valid:
                        print(">>> AUTH: Using PERMANENT REFRESH TOKEN (Verified Success)", flush=True)
                        return build('drive', 'v3', credentials=creds)
            
            print("DEBUG: Permanent Refresh Token provided but could not be verified or refreshed.", flush=True)
        except Exception as e:
            print(f"CRITICAL DEBUG: Permanent Refresh Token flow FAILED: {e}", flush=True)
            # Fallback to local token.json if the env var token is dead

    # 1. Priority: User OAuth Token (Recommended for Quota/Ownership)
    # Try to load token from environment/base64 first
    if not os.path.exists(RUNTIME_TOKEN_FILE):
        # Primero intentar desde base de datos (Persistente)
        try:
            from db_conn import engine
            from sqlalchemy import text
            import base64
            with engine.connect() as conn:
                result = conn.execute(text("SELECT drive_token_b64 FROM inventory_users WHERE drive_token_b64 IS NOT NULL LIMIT 1")).fetchone()
                if result and result[0]:
                    encoded_data = result[0]
                    decoded_data = base64.b64decode(encoded_data).decode('utf-8')
                    with open(RUNTIME_TOKEN_FILE, 'w') as f:
                        f.write(decoded_data)
                    print("DEBUG: Restored token from database", flush=True)
        except Exception as e:
            print(f"DEBUG: Error reading token from DB: {e}", flush=True)

        # Segundo intentar archivo local base64
        if not os.path.exists(RUNTIME_TOKEN_FILE) and os.path.exists('token.b64'):
            try:
                import base64
                with open('token.b64', 'r') as f:
                    encoded_data = f.read()
                    decoded_data = base64.b64decode(encoded_data).decode('utf-8')
                with open(RUNTIME_TOKEN_FILE, 'w') as f:
                    f.write(decoded_data)
                print("DEBUG: Restored token from base64 disk file", flush=True)
            except Exception as e:
                print(f"DEBUG: Error decoding token.b64: {e}", flush=True)
        # Tercero copiar el token.json estatico
        elif not os.path.exists(RUNTIME_TOKEN_FILE) and os.path.exists(TOKEN_FILE):
            import shutil
            try:
                shutil.copy(TOKEN_FILE, RUNTIME_TOKEN_FILE)
            except: pass

    if os.path.exists(RUNTIME_TOKEN_FILE):
        try:
            print(f"DEBUG: Found {RUNTIME_TOKEN_FILE}, checking credentials...", flush=True)
            creds = Credentials.from_authorized_user_file(RUNTIME_TOKEN_FILE, SCOPES)
            if creds and creds.expired and creds.refresh_token:
                print("DEBUG: User Token expired, attempting refresh...", flush=True)
                try:
                    creds.refresh(Request())
                    with open(RUNTIME_TOKEN_FILE, 'w') as token:
                        token.write(creds.to_json())
                    # Also update base token.json if writable
                    try:
                        with open(TOKEN_FILE, 'w') as f:
                            f.write(creds.to_json())
                    except: pass
                    print("DEBUG: User Token refreshed successfully", flush=True)
                except Exception as refresh_err:
                    print(f"DEBUG: User Token refresh failed: {refresh_err}", flush=True)
                    creds = None
            
            if creds and creds.valid:
                print(">>> AUTH: Using USER CREDENTIALS (Full Quota)", flush=True)
                return build('drive', 'v3', credentials=creds)
            else:
                print(f"DEBUG: Creds were found but are not valid. Valid: {creds.valid if creds else 'N/A'}", flush=True)
        except Exception as e:
            print(f"DEBUG: Error loading user token: {e}", flush=True)

    # 2. Priority: Service Account (Fallback - May have 0 quota for direct uploads)
    service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if service_account_path and os.path.exists(service_account_path):
        print(f"DEBUG: Attempting Service Account Fallback...", flush=True)
        try:
            creds = service_account.Credentials.from_service_account_file(
                service_account_path, scopes=SCOPES)
            print(">>> AUTH: Using SERVICE ACCOUNT (Warning: No individual quota)", flush=True)
            return build('drive', 'v3', credentials=creds)
        except Exception as e:
            print(f"DEBUG: Service Account failed: {e}", flush=True)

    # 3. Interactive flow (Local Dev only)
    if os.path.exists(CLIENT_SECRET_FILE) and not os.getenv('K_SERVICE'):
        try:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
            print(">>> AUTH: Using LOCAL INTERACTIVE FLOW", flush=True)
            return build('drive', 'v3', credentials=creds)
        except Exception as e:
            print(f"DEBUG: Interactive flow failed: {e}", flush=True)

    print("CRITICAL: No valid authentication found for Google Drive", flush=True)
    return None

def create_folder(service, folder_name, parent_id=None):
    """Create a folder on Google Drive."""
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    if parent_id:
        file_metadata['parents'] = [parent_id]

    try:
        file = service.files().create(
            body=file_metadata, 
            fields='id, webViewLink',
            supportsAllDrives=True
        ).execute()
        print(f'Folder ID: "{file.get("id")}". Link: {file.get("webViewLink")}')
        return file
    except Exception as e:
        print(f'An error occurred creating folder: {e}')
        return None

def make_file_public(service, file_id):
    """Make a file publicly readable."""
    try:
        permission = {
            'type': 'anyone',
            'role': 'reader',
        }
        service.permissions().create(
            fileId=file_id,
            body=permission,
            fields='id',
            supportsAllDrives=True
        ).execute()
        print(f"File {file_id} is now public.")
        return True
    except Exception as e:
        print(f"Error making file public: {e}")
        return False

def upload_file(service, file_content, file_name, folder_id, content_type='image/jpeg', make_public=False):
    """Upload a file to a specific folder."""
    file_metadata = {
        'name': file_name,
        'parents': [folder_id]
    }
    media = MediaIoBaseUpload(io.BytesIO(file_content), mimetype=content_type, resumable=True)
    
    try:
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink, thumbnailLink, webContentLink',
            supportsAllDrives=True
        ).execute()
        print(f'File ID: "{file.get("id")}".')
        
        if make_public:
            make_file_public(service, file.get('id'))
            
        return file
    except Exception as e:
        print(f'An error occurred uploading file: {e}')
        raise e

def extract_id_from_url(url):
    """Extract folder ID from a Drive URL."""
    if not url: return None
    # Support various formats:
    # https://drive.google.com/drive/folders/1...
    # https://drive.google.com/drive/u/0/folders/1...
    parts = url.strip().split('/')
    for part in parts:
        if len(part) > 20 and '?' not in part: # Simple heuristic
             return part
        if '?' in part:
             subparts = part.split('?')
             if len(subparts[0]) > 20: 
                 return subparts[0]
                 
    # Regex might be safer but this covers common Copy Link formats
    return None

def list_files(service, folder_id):
    """List files in a specific folder."""
    try:
        # Search for images in this folder
        query = f"'{folder_id}' in parents and (mimeType contains 'image/') and trashed = false"
        results = service.files().list(
            q=query,
            fields="files(id, name, webViewLink, thumbnailLink, webContentLink)",
            pageSize=10,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        return results.get('files', [])
    except Exception as e:
        print(f'An error occurred listing files: {e}')
        return []
