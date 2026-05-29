# Guía de Migración del Proyecto

Esta guía contiene los pasos detallados para restaurar y ejecutar el sistema de inventario en una nueva computadora después de clonar el proyecto desde GitHub.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en la nueva PC:
1. **Python (versión 3.10 o superior)**: Durante la instalación en Windows, marca obligatoriamente la casilla **"Add Python to PATH"**.
2. **Git**: Para clonar el repositorio.

---

## 🚀 Paso a Paso para la Instalación

### 1. Clonar el Repositorio de GitHub
Abre la terminal (PowerShell o CMD) y clona el repositorio:
```bash
git clone https://github.com/guiasLocales/importfull-catalogo.git
cd importfull-catalogo
```

### 2. Restaurar los Archivos Protegidos (Backup ZIP)
Descomprime el archivo **`backup_migracion.zip`** que guardaste antes de formatear tu PC anterior. Copia los siguientes archivos extraídos directamente a la raíz de la carpeta del proyecto (`importfull-catalogo`):
* `.env`
* `client_secret.json`
* `credentials.json`
* `analytical-rain-485717-r5-41965208de09.json`
* `token.json`
* `token.b64`
* `inventory.db`

---

## 📦 Configuración del Entorno de Python

### 3. Crear el Entorno Virtual (Venv)
En la terminal del proyecto, ejecuta:
```powershell
python -m venv venv
```

### 4. Activar el Entorno Virtual
* **En Windows (PowerShell):**
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
* **En Windows (CMD):**
  ```cmd
  .\venv\Scripts\activate.bat
  ```

### 5. Instalar las Dependencias
Con el entorno virtual activo (`(venv)` al inicio de la línea de la consola), instala todos los módulos requeridos:
```bash
pip install -r requirements.txt
```

---

## 🚦 Iniciar la Aplicación

### 6. Ejecutar el Servidor Local
Para correr el servidor localmente, usa:
```bash
uvicorn main:app --reload
```
Abre en tu navegador `http://localhost:8000` para acceder a la aplicación.

---

## ☁️ Información sobre la Base de Datos
* Los datos principales (inventario, ventas, etc.) están seguros en la nube de Google Cloud (MySQL). Al colocar el archivo `.env` restaurado, la aplicación se reconectará automáticamente sin perder datos.
