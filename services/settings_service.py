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
            "theme_pref": "light"
        }
        self.file_id = None
        self.service = None

    def _get_service(self):
        if not self.service:
            self.service = drive_service.get_drive_service()
        return self.service

    def load_settings(self):
        """Load settings from Google Drive file"""
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
                # Download content
                content = service.files().get_media(fileId=self.file_id).execute()
                self.settings = json.loads(content.decode('utf-8'))
                print(f"Settings loaded from Drive: {self.settings}")
            else:
                print("Settings file not found on Drive. Using defaults.")
                self.save_settings() # Create it

        except Exception as e:
            print(f"Error loading settings: {e}")
        
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
            
            media = MediaIoBaseUpload(
                io.BytesIO(json.dumps(self.settings).encode('utf-8')),
                mimetype='application/json',
                resumable=True
            )

            if self.file_id:
                # Update existing file
                service.files().update(
                    fileId=self.file_id,
                    media_body=media
                ).execute()
                print("Settings updated on Drive")
            else:
                # Create new file
                file = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                self.file_id = file.get('id')
                print(f"Settings file created on Drive (ID: {self.file_id})")
                
            return True

        except Exception as e:
            print(f"Error saving settings: {e}")
            return False

    def update_setting(self, key, value):
        # Always reload from Drive to ensure we have the latest state
        # preventing overwrites if multiple instances are running
        current_settings = self.load_settings()
        
        # Update and save
        self.settings[key] = value
        return self.save_settings()

    def get_setting(self, key, default=None):
        if not self.settings.get(key):
            self.load_settings()
        return self.settings.get(key, default)

# Singleton instance
settings_manager = SettingsService()
