# Pasos para Deploy en Cloud Run + GitHub

## 📋 Paso 1: Preparar GitHub

### 1.1 Crear repositorio en GitHub
1. Ve a https://github.com/new
2. Nombre: `inventory-app` (o el que prefieras)
3. Privado o Público (tu eliges)
4. NO inicializar con README
5. Click "Create repository"

### 1.2 Subir el código
```bash
# Navegar al proyecto
cd "G:\.shortcut-targets-by-id\1dEYxhEICbD2tI2HafYRr6wq6BXw-CGYD\importfull-inventory"

# Inicializar git
git init

# Crear .gitignore
# (Ya creado automáticamente)

# Agregar archivos
git add .

# Commit inicial
git commit -m "Initial commit - Inventory Management System"

# Conectar con GitHub (reemplaza TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/inventory-app.git

# Subir código
git push -u origin main
```

---

## 🚀 Paso 2: Deploy en Cloud Run

### 2.1 Deploy inicial (Manual - Solo 1 vez)
```bash
# Habilitar APIs necesarias
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Deploy desde código local
gcloud run deploy inventory-app \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DB_USER=leandro_guias,DB_NAME=import_gestion_inventario,INSTANCE_CONNECTION_NAME=analytical-rain-485717-r5:us-central1:import-gestion-inventario-sql" \
  --set-secrets "DB_PASSWORD=DB_PASSWORD:latest"
```

**IMPORTANTE:** Las credenciales de Google Drive se manejan diferente (ver paso 3)

### 2.2 Configurar variables de entorno en Cloud Run
```bash
# Configurar variables
gcloud run services update inventory-app \
  --region us-central1 \
  --set-env-vars "ROOT_DRIVE_FOLDER_ID=TU_FOLDER_ID_AQUI"
```

---

## 🔑 Paso 3: Configurar Secretos en Google Secret Manager

### 3.1 Crear secretos
```bash
# Crear secreto para DB password (si no existe)
echo -n "TU_PASSWORD_AQUI" | gcloud secrets create DB_PASSWORD --data-file=-

# Crear secreto para Google Drive credentials
gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS \
  --data-file="analytical-rain-485717-r5-41965208de09.json"
```

### 3.2 Dar acceso a Cloud Run
```bash
# Obtener el service account de Cloud Run
PROJECT_ID=$(gcloud config get-value project)
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

# Dar permisos
gcloud secrets add-iam-policy-binding DB_PASSWORD \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GOOGLE_APPLICATION_CREDENTIALS \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 🔄 Paso 4: Auto-Deploy desde GitHub (Opcional pero Recomendado)

### 4.1 Conectar GitHub con Cloud Build
```bash
# En Cloud Console:
# 1. Ve a Cloud Build → Triggers
# 2. Click "Connect Repository"
# 3. Selecciona GitHub
# 4. Autoriza GitHub
# 5. Selecciona tu repositorio
```

### 4.2 Crear trigger
```bash
gcloud builds triggers create github \
  --repo-name=inventory-app \
  --repo-owner=TU_USUARIO \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

---

## ✅ Verificar Deployment

### Obtener URL
```bash
gcloud run services describe inventory-app \
  --region us-central1 \
  --format="value(status.url)"
```

### Probar
```bash
curl https://TU-URL.run.app/
```

---

## 🔧 Comandos Útiles

### Ver logs
```bash
gcloud run services logs read inventory-app --region us-central1
```

### Actualizar variables
```bash
gcloud run services update inventory-app \
  --region us-central1 \
  --set-env-vars "NUEVA_VAR=valor"
```

### Re-deploy manualmente
```bash
gcloud run deploy inventory-app --source .
```

---

## 📝 Notas Importantes

1. **Credenciales de Google Drive:**
   - NO subir `credentials.json` a GitHub
   - Usar Google Secret Manager
   - Montarlo como archivo en Cloud Run

2. **Database:**
   - Cloud SQL Connector funciona automáticamente
   - No necesitas Cloud SQL Proxy

3. **Costos:**
   - Primeros 2M requests/mes: GRATIS
   - Después: ~$0.40 por millón de requests

4. **Dominio personalizado:**
   ```bash
   gcloud run domain-mappings create \
     --service inventory-app \
     --domain tudominio.com \
     --region us-central1
   ```
