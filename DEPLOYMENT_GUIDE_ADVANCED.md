# 🚀 Guía Avanzada de Deploy y GitHub CI/CD

Esta guía detalla cómo el código viaja desde tu PC hasta Google Cloud mediante automatización.

## 🛠 Conexión vía GitHub (CI/CD)

El flujo de trabajo automatizado funciona de la siguiente manera:

1.  **Commit & Push**: Subes cambios a tu repo de GitHub.
2.  **Trigger (Cloud Build)**: Google Cloud tiene un "Trigger" que escucha cambios en la rama `main`.
3.  **Build**: Google Cloud lee el archivo `cloudbuild.yaml` y ejecuta:
    *   `docker build`: Crea una imagen de contenedor con todo el código.
    *   `docker push`: Sube esa imagen a Google Container Registry (GCR).
4.  **Deploy**: Google Cloud actualiza el servicio en **Cloud Run** usando la nueva imagen.

### Cómo configurar el Trigger manualmente:
1.  Ir a [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers).
2.  Conectar el repositorio de GitHub.
3.  Seleccionar el evento "Push to a branch".
4.  Apuntar al archivo `cloudbuild.yaml`.

## ⚙️ Configuración del Entorno (`service.yaml`)

El archivo `service.yaml` es el cerebro del despliegue. Define:
*   **Variables de Entorno**: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DEEPSEEK_API_KEY`.
*   **Secretos**: Cómo se montan las credenciales de Google Cloud (`/secrets/credentials.json`).
*   **Recursos**: Memoria (512Mi) y CPU (1000m).

> [!IMPORTANT]
> Si cambias una variable en `service.yaml`, debes ejecutar:
> `gcloud run services replace service.yaml --region us-central1`

## 📦 Despliegue Manual Rápido
Si no quieres usar GitHub, el archivo `deploy_now.bat` ejecuta:
`gcloud run deploy inventory-app --source . --region us-central1 --allow-unauthenticated`
Esto construye y despliega directamente desde tu terminal local.

## 🔍 Troubleshooting de Conexión
*   **Base de Datos**: Si falla la conexión, verifica que la IP `34.133.83.104` sea accesible y que el usuario `leandro_guias` tenga permisos.
*   **Logs**: Usa `gcloud run services logs read inventory-app` para ver errores en tiempo real.
