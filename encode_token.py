import base64
import os

TOKEN_PATH = r"C:\importfull-inventory\token.json"
B64_PATH = r"C:\importfull-inventory\token.b64"

if os.path.exists(TOKEN_PATH):
    with open(TOKEN_PATH, 'r') as f:
        data = f.read()
        encoded = base64.b64encode(data.encode('utf-8')).decode('utf-8')
    
    with open(B64_PATH, 'w') as f:
        f.write(encoded)
    print(f"Encoded {TOKEN_PATH} to {B64_PATH}")
else:
    print(f"{TOKEN_PATH} not found")
