import os
import base64
import json
import sys
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

def main():
    token_file = 'token.json'
    scopes = ['https://www.googleapis.com/auth/drive']
    
    print(f"--- Drive Token Repair Utility ---", flush=True)
    
    if not os.path.exists(token_file):
        print(f"ERROR: {token_file} missing in {os.getcwd()}", flush=True)
        return

    try:
        with open(token_file, 'r') as f:
            data = json.load(f)
            print(f"INFO: Token file loaded. Expiry was: {data.get('expiry')}", flush=True)
            if not data.get('refresh_token'):
                print("WARNING: No refresh_token found in token.json. Refresh will fail.", flush=True)

        creds = Credentials.from_authorized_user_file(token_file, scopes)
        
        if creds.expired:
            print("INFO: Token is expired. Attempting refresh via Google APIs...", flush=True)
            try:
                creds.refresh(Request())
                print(f"SUCCESS: Token refreshed! New expiry: {creds.expiry}", flush=True)
                
                # Save refreshed token
                token_json = creds.to_json()
                with open(token_file, 'w') as f:
                    f.write(token_json)
                print("INFO: Updated token.json", flush=True)
                
                # Encode for Cloud Run
                new_b64 = base64.b64encode(token_json.encode('utf-8')).decode('utf-8')
                with open('token.b64', 'w') as f:
                    f.write(new_b64)
                print("INFO: Updated token.b64", flush=True)
                print("\n>>> CLEANUP COMPLETE. Pushing to GitHub...", flush=True)
                
            except Exception as e:
                print(f"CRITICAL ERROR: Could not refresh token: {e}", flush=True)
                print("This usually means the refresh token was revoked or is invalid.", flush=True)
        else:
            print("INFO: Token is still valid. Encoding existing one to token.b64 just in case.", flush=True)
            token_json = creds.to_json()
            new_b64 = base64.b64encode(token_json.encode('utf-8')).decode('utf-8')
            with open('token.b64', 'w') as f:
                f.write(new_b64)
            print("INFO: Updated token.b64", flush=True)

    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", flush=True)

if __name__ == "__main__":
    main()
