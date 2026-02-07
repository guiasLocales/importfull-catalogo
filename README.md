# 📦 Sistema de Gestión de Inventario - MercadoLibre

Sistema de gestión de inventario integrado con MercadoLibre y Google Drive.

## 🚀 Características

- ✅ Gestión de productos con Cloud SQL (MySQL)
- ✅ Integración con MercadoLibre para publicación
- ✅ Almacenamiento de imágenes en Google Drive
- ✅ Interface web responsive
- ✅ Auto-sincronización con MercadoLibre

## 🛠️ Tecnologías

- **Backend:** FastAPI (Python 3.11)
- **Base de Datos:** Google Cloud SQL (MySQL)
- **Almacenamiento:** Google Drive API
- **Deploy:** Google Cloud Run
- **Integración:** MercadoLibre API

## 📋 Requisitos

- Python 3.11+
- Google Cloud Account
- MercadoLibre Developer Account

## 🔧 Configuración Local

1. Clonar el repositorio
```bash
git clone https://github.com/TU-USUARIO/inventory-app.git
cd inventory-app
```

2. Instalar dependencias
```bash
pip install -r requirements.txt
```

3. Configurar variables de entorno (.env)
```
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=import_gestion_inventario
INSTANCE_CONNECTION_NAME=tu-proyecto:region:instancia
ROOT_DRIVE_FOLDER_ID=tu_folder_id
```

4. Ejecutar servidor local
```bash
uvicorn main:app --reload
```

## 🚢 Deployment en Cloud Run

Ver instrucciones completas en [DEPLOYMENT.md](DEPLOYMENT.md)

### Deploy rápido
```bash
gcloud run deploy inventory-app \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## 📝 Licencia

Privado - Todos los derechos reservados

## 👤 Autor

Leandro Guías
