# 🧠 Resumen de Contexto para Antigravity (Historial)

Este documento sirve como "memoria de largo plazo" para que cualquier instancia de Antigravity pueda retomar el proyecto sin perder información de los chats anteriores.

## 📜 Historial de Tareas Realizadas

### 1. Implementación de Vista de Competencia
*   **Objetivo**: Crear una vista para comparar precios con la competencia basada en scrapings.
*   **Logro**: Se adaptó el backend para usar `mercadolibre.scrapped_competence`. Se corrigió el uso de URLs como claves primarias y se integró la lógica de costos en los scripts de migración (`migrate_competence_costs.py`).

### 2. Integración de DeepSeek AI (Fix 500 Error)
*   **Objetivo**: Resolver errores al generar títulos y descripciones con IA.
*   **Logro**: Se cambió la integración de scraping por una conexión directa a la API de DeepSeek. Se configuró la clave de API en `service.yaml` y se actualizaron los prompts en la base de datos para mayor precisión.

### 3. Panel de Configuración y Redes Sociales
*   **Objetivo**: Permitir al admin configurar links de Instagram, Facebook y TikTok.
*   **Logro**: Se añadieron columnas a la base de datos, se actualizó el panel `config.html` y se insertaron los iconos dinámicos en el pie de página de las categorías.

## 📍 Estado Actual y Pendientes
*   **Estado**: El sistema es funcional y está desplegado en Cloud Run. La sincronización con Google Sheets es estable.
*   **Próximos Pasos Sugeridos**:
    *   Optimizar la carga de imágenes pesadas en el frontend.
    *   Implementar un sistema de logs más visual para el usuario en el dashboard.
    *   Añadir validaciones de stock en tiempo real adicionales para Mercado Libre.

## 🛠 Comandos Útiles para el Agente
*   `python migrate_local.py`: Sincroniza el inventario localmente.
*   `python check_db.py`: Verifica la integridad de las tablas.
*   `deploy_now.bat`: Despliega cambios a producción.
