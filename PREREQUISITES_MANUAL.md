# 🛠 Manual de Instalación y Requisitos (Prerrequisitos)

Para ejecutar este proyecto en una nueva computadora o entorno, debes tener instalado lo siguiente:

## 1. Herramientas de Desarrollo (Software)

*   **Python 3.11+**: Es el lenguaje principal. Descárgalo de [python.org](https://www.python.org/).
    *   *Nota*: Asegúrate de marcar la casilla "Add Python to PATH" durante la instalación.
*   **Git**: Necesario para clonar el repositorio y manejar versiones. Descárgalo de [git-scm.com](https://git-scm.com/).
*   **Google Cloud SDK (gcloud CLI)**: Imprescindible para el despliegue manual y gestión de Cloud Run.
    *   Instalación: [Guía de Google Cloud SDK](https://cloud.google.com/sdk/docs/install).
*   **Docker (Opcional)**: Útil para probar la aplicación localmente en un contenedor idéntico al de producción. Descárgalo de [Docker Desktop](https://www.docker.com/products/docker-desktop/).

## 2. Configuración del Entorno Python

Una vez instalado Python, abre una terminal en la carpeta del proyecto y ejecuta:

```powershell
# 1. Crear entorno virtual (recomendado)
python -m venv venv

# 2. Activar el entorno virtual
# En Windows:
.\venv\Scripts\activate
# En Linux/Mac:
source venv/bin/activate

# 3. Instalar todas las librerías necesarias
pip install -r requirements.txt
```

### Librerías Críticas Incluidas:
*   **FastAPI**: Servidor web principal.
*   **SQLAlchemy & PyMySQL**: Conexión a la base de datos MySQL.
*   **Google Auth Libraries**: Para autenticación con Google Sheets y Drive.
*   **Cryptography & Jose**: Manejo de tokens y seguridad.

## 3. Credenciales y Archivos de Configuración

Sin estos archivos, la aplicación NO funcionará:

*   **`credentials.json`**: Credenciales de OAuth2 obtenidas de Google Cloud Console (APIs de Sheets/Drive).
*   **`token.json`**: Se genera automáticamente la primera vez que la app pide permiso para acceder a Drive, o debe copiarse del servidor si ya existe.
*   **`service.yaml`**: Contiene las variables de entorno de producción (`DB_PASSWORD`, `DEEPSEEK_API_KEY`).
*   **`credentials-cloud.json`**: (A veces llamado `credentials.json` en los secretos) necesario para que el servidor acceda a los recursos de Google Cloud.

## 4. Acceso a Base de Datos
*   Si vas a trabajar de forma remota, tu IP debe estar permitida en el Firewall de Google Cloud SQL, o debes usar el `Cloud SQL Auth Proxy`.
*   Para pruebas rápidas locales, algunos scripts usan `inventory.db` (SQLite), pero el sistema principal espera MySQL.

## 5. Comandos de Verificación
Para saber si tienes todo listo, ejecuta:
```powershell
python --version
pip list  # Debería mostrar todas las librerías de requirements.txt
gcloud --version
```
