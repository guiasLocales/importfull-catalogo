# 📋 Resumen del Proyecto: Inventory App (ImportFull)

Este proyecto es un sistema de gestión de inventario y optimización de precios para e-commerce, diseñado para integrarse con Google Sheets y utilizar Inteligencia Artificial (DeepSeek) para el procesamiento de productos.

## 🏗 Arquitectura Técnica

### 1. Backend (FastAPI / Python)
*   **Framework**: FastAPI (Asíncrono, de alto rendimiento).
*   **Base de Datos**: MySQL (Google Cloud SQL) como motor principal, con SQLite para pruebas locales.
*   **ORM**: SQLAlchemy para el mapeo de objetos y gestión de esquemas.
*   **Estructura**:
    *   `main.py`: Punto de entrada, configuración de CORS y montaje de rutas.
    *   `routers/`: Dividido por funciones (`products`, `auth`, `competence`, `prompts`).
    *   `models.py` / `schemas.py`: Definición de tablas y validación de datos (Pydantic).
    *   `crud.py`: Lógica central de acceso a datos.

### 2. Frontend (Web Dinámica)
*   **Tecnologías**: HTML5, Vanilla CSS, Vanilla JavaScript.
*   **Características**: Single-Page Application (SPA) simulada mediante manipulación del DOM en `app.js`.
*   **Estética**: Diseño moderno con gradientes, glassmorphism y micro-animaciones.
*   **Ubicación**: Todos los archivos públicos residen en `/static`.

### 3. Integraciones Externas
*   **Google Sheets / Drive**: Sincronización bidireccional de inventario mediante `Google Sheets API`. Requiere `credentials.json` y `token.json`.
*   **DeepSeek AI**: Generación automática de títulos y descripciones optimizadas para e-commerce. Se configura mediante `DEEPSEEK_API_KEY` en el entorno.

## 🔗 Funcionamiento de Sincronización
El sistema lee productos de una hoja de Google Sheets, los procesa localmente (comparación de precios, optimización AI) y permite volver a subirlos o actualizarlos. Utiliza `meli_id` para vincular con Mercado Libre si es necesario.

## 📂 Archivos Clave
*   `db_conn.py`: Lógica de conexión resiliente a bases de datos remotas.
*   `service.yaml`: Configuración maestra para Google Cloud Run.
*   `requirements.txt`: Dependencias del sistema.
