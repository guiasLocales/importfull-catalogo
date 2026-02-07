import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/drive']
CLIENT_SECRET_FILE = 'client_secret.json'
TOKEN_FILE = 'token.json'

# ROOT FOLDER ID: Get from Env Var or use default
ROOT_FOLDER_ID = os.getenv('ROOT_DRIVE_FOLDER_ID', "1dd2P6OkaFgvkah-sBr_sjagAnCk31n-v")

def get_drive_service():
    """Builds and returns the Drive service."""
    creds = None
    
    # 1. Priorities: Local/User OAuth (token.json)
    # This is required for Drive Uploads to use the User's Limit, not the Service Account (0 bytes)
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
            if creds and creds.valid:
                print("Using User Credentials from token.json")
                return build('drive', 'v3', credentials=creds)
            elif creds and creds.expired and creds.refresh_token:
                print("Refreshing expired user token...")
                creds.refresh(Request())
                # Save refreshed token
                with open(TOKEN_FILE, 'w') as token:
                    token.write(creds.to_json())
                return build('drive', 'v3', credentials=creds)
        except Exception as e:
            print(f"Error loading token.json: {e}")

    # 2. Service Account (Cloud Run Default)
    service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if service_account_path and os.path.exists(service_account_path):
        print(f"Using Service Account credentials from {service_account_path}")
        try:
            creds = service_account.Credentials.from_service_account_file(
                service_account_path, scopes=SCOPES)
            return build('drive', 'v3', credentials=creds)
        except Exception as e:
            print(f"Error loading Service Account: {e}")
            
    if not creds:
        # 3. Interactive flow (Local Dev only)
        if not os.path.exists(CLIENT_SECRET_FILE):
            # If we are in cloud and no service account worked, this is a critical error
            if os.getenv('K_SERVICE'): # Variable that exists in Cloud Run
                print("CRITICAL: Running in Cloud Run but no valid credentials found.")
                return None
            
            print(f"CRITICAL: {CLIENT_SECRET_FILE} not found. Please provide OAuth credentials.")
            return None
        else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    CLIENT_SECRET_FILE, SCOPES)
                creds = flow.run_local_server(port=0)
        
        # Save the credentials for the next run (only locally)
        try:
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
        except Exception as e:
             print(f"Warning: Could not save token.json: {e}")

    try:
        service = build('drive', 'v3', credentials=creds)
        return service
    except Exception as e:
        print(f"Error building Drive service: {e}")
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
        file = service.files().create(body=file_metadata, fields='id, webViewLink').execute()
        print(f'Folder ID: "{file.get("id")}". Link: {file.get("webViewLink")}')
        return file
    except Exception as e:
        print(f'An error occurred creating folder: {e}')
        return None

def upload_file(service, file_content, file_name, folder_id, content_type='image/jpeg'):
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
            fields='id, webViewLink, thumbnailLink'
        ).execute()
        print(f'File ID: "{file.get("id")}".')
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
            pageSize=10
        ).execute()
        return results.get('files', [])
    except Exception as e:
        print(f'An error occurred listing files: {e}')
        return []
