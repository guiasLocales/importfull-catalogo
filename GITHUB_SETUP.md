# 🚀 Cómo configurar Despliegue Automático con GitHub

Para que cada vez que hagas un cambio y lo subas a GitHub se despliegue solo en Google Cloud, sigue estos pasos:

## 1. Preparar el Repositorio (En tu PC)
1.  Asegúrate de tener todos los archivos listos (incluyendo el `cloudbuild.yaml` que acabo de crear).
2.  Abre una terminal en tu carpeta del proyecto.
3.  Si no tienes git iniciado:
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```

## 2. Crear Repositorio en GitHub
1.  Ve a [GitHub.com](https://github.com) y crea un **Nuevo Repositorio** (puedes llamarlo `inventory-app`).
2.  Copia el comando para conectar tu carpeta existente, será algo así:
    ```bash
    git remote add origin https://github.com/TU_USUARIO/inventory-app.git
    git branch -M main
    git push -u origin main
    ```
    *(Ejecuta esos comandos en tu terminal).*

## 3. Conectar Cloud Build (En Google Cloud)
1.  Ve a [Google Cloud Console - Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers).
2.  Haz clic en **"Crear activador"** (Create Trigger).
3.  **Nombre**: `github-deploy-trigger`.
4.  **Evento**: "Enviar a una rama" (Push to a branch).
5.  **Fuente (Source)**:
    - Haz clic en conectar nuevo repositorio.
    - Selecciona **GitHub**.
    - Autoriza a Google Cloud y elige tu repositorio `inventory-app`.
6.  **Configuración**:
    - Tipo: **Archivo de configuración de Cloud Build**.
    - Ubicación: `cloudbuild.yaml` (Debería estar preseleccionado).
7.  Haz clic en **CREAR**.

## 4. ¡Listo!
Ahora, haz un pequeño cambio en cualquier archivo y súbelo:
```bash
git add .
git commit -m "Prueba de despliegue"
git push
```
¡Google Cloud detectará el cambio y empezará a desplegar automáticamente! 🎉

> **Nota sobre `token.json`**:
> Como estamos usando un enfoque simple, asegurate de que `token.json` (tus credenciales de Drive) se suba al repositorio para que funcione. En un entorno profesional usaríamos "Secret Manager", pero para empezar esto funcionará.
