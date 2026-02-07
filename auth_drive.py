from services.drive_service import get_drive_service
import os

def authenticate_user():
    # Remove existing token if it exists to force re-auth
    if os.path.exists('token.json'):
         print("Removing old token.json...")
         os.remove('token.json')
         
    print("Starting authentication flow...")
    print("A browser window should open. Please log in with your Google Account.")
    
    service = get_drive_service()
    
    if service:
        print("\nSUCCESS: Authentication complete. 'token.json' has been created.")
        print("You can now restart the server.")
    else:
        print("\nFAIL: Could not authenticate.")

if __name__ == "__main__":
    authenticate_user()
