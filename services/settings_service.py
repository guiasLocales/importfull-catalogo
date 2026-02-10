"""
Settings Service (Google Drive Backend)
Stores application settings (logos, themes) in a JSON file on Google Drive.
This bypasses database schema requirements.
"""
import json
import os
from services import drive_service

SETTINGS_FILENAME = "app_settings.json"

class SettingsService:
    def __init__(self):
        self.settings = {
            "logo_light_url": None,
            "logo_dark_url": None,
            "favicon_url": None,
            "theme_pref": "light"
        }
        self.file_id = None
        self.service = None

    def _get_service(self):
        if not self.service:
            # Import here to avoid circular dependencies if any
            from services.drive_service import get_drive_service
            self.service = get_drive_service()
        return self.service

    def load_settings(self):
        """Load settings from Google Drive file"""
        print(f"DEBUG: Loading settings from Drive...")
        try:
            service = self._get_service()
            if not service:
                print("WARNING: Could not connect to Drive for settings")
                return self.settings

            # Search for settings file
            folder_id = os.getenv('LOGOS_FOLDER_ID', drive_service.ROOT_FOLDER_ID)
            query = f"name = '{SETTINGS_FILENAME}' and '{folder_id}' in parents and trashed = false"
            
            results = service.files().list(q=query, fields="files(id, name)").execute()
            files = results.get('files', [])

            if files:
                self.file_id = files[0]['id']
                print(f"DEBUG: Settings file found (ID: {self.file_id})")
                
                # Download content
                content = service.files().get_media(fileId=self.file_id).execute()
                loaded_json = content.decode('utf-8')
                
                if not loaded_json.strip():
                    print("WARNING: Settings file is empty")
                    loaded_settings = {}
                else:
                    loaded_settings = json.loads(loaded_json)
                
                # Merge with existing settings (don't overwrite self.settings completely)
                # This preserves any in-memory updates that might be pending
                for k, v in loaded_settings.items():
                    self.settings[k] = v
                    
                print(f"DEBUG: Active Settings: {self.settings}")
            else:
                print("DEBUG: Settings file not found on Drive. Creating new.")
                self.save_settings() # Create empty file

        except Exception as e:
            print(f"ERROR loading settings: {e}")
            import traceback
            traceback.print_exc()
        
        return self.settings

    def save_settings(self):
        """Save current settings to Google Drive"""
        try:
            service = self._get_service()
            if not service:
                return False

            folder_id = os.getenv('LOGOS_FOLDER_ID', drive_service.ROOT_FOLDER_ID)
            
            file_metadata = {
                'name': SETTINGS_FILENAME,
                'parents': [folder_id]
            }
            
            from googleapiclient.http import MediaIoBaseUpload
            import io
            
            json_content = json.dumps(self.settings, indent=2)
            media = MediaIoBaseUpload(
                io.BytesIO(json_content.encode('utf-8')),
                mimetype='application/json',
                resumable=True
            )

            if self.file_id:
                # Update existing file
                print(f"DEBUG: Updating existing settings file {self.file_id}")
                service.files().update(
                    fileId=self.file_id,
                    media_body=media
                ).execute()
            else:
                # Create new file
                print(f"DEBUG: Creating NEW settings file")
                file = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                self.file_id = file.get('id')
                
            print(f"DEBUG: Settings saved successfully")
            return True

        except Exception as e:
            print(f"ERROR saving settings: {e}")
            import traceback
            traceback.print_exc()
            return False

    def update_setting(self, key, value):
        print(f"DEBUG: REQUEST UPDATE setting '{key}' = '{value}'")
        
        # 1. Reload first to get latest state from Drive
        # This is CRITICAL to avoid overwriting other keys
        self.load_settings()
        
        # 2. Update local state
        self.settings[key] = value
        
        # 3. Save everything back
        print(f"DEBUG: Saving full settings object: {self.settings}")
        return self.save_settings()

    def get_setting(self, key, default=None):
        # Refresh if empty
        if not self.settings.get(key) and not self.file_id:
            self.load_settings()
        return self.settings.get(key, default)

# Singleton instance
settings_manager = SettingsService()
