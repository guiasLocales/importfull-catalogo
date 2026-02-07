from google_auth_oauthlib.flow import InstalledAppFlow
import os

# Scopes required
SCOPES = ['https://www.googleapis.com/auth/drive']

def main():
    if not os.path.exists('client_secret.json'):
        print("ERROR: client_secret.json not found!")
        print("Please download it from Google Cloud Console (APIs & Services > Credentials > Create Credentials > OAuth Client ID > Desktop App)")
        return

    flow = InstalledAppFlow.from_client_secrets_file(
        'client_secret.json', SCOPES)
    
    print("Opening browser for authentication...")
    creds = flow.run_local_server(port=0)

    # Save the credentials for the next run
    with open('token.json', 'w') as token:
        token.write(creds.to_json())
    
    print("\nSUCCESS! 'token.json' has been created.")
    print("Now re-deploy your application to include this file.")

if __name__ == '__main__':
    main()
