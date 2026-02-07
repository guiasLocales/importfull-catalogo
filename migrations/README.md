# Migración de Base de Datos - Cloud SQL

## Problema
El servidor no puede cargar productos porque faltan columnas en la tabla `product_catalog_sync`.

## Solución Rápida

### Opción 1: Ejecutar desde Cloud SQL Console (RECOMENDADO)

1. Ve a [Cloud SQL Console](https://console.cloud.google.com/sql)
2. Selecciona tu instancia `inventory-db`
3. Click en "Ejecutar consulta" (Query)
4. Copia y pega el contenido del archivo `migrations/add_missing_columns.sql`
5. Click "Ejecutar"

### Opción 2: Usar gcloud CLI

```bash
gcloud sql connect inventory-db --user=root --database=inventory-db

# Luego ejecuta el contenido de migrations/add_missing_columns.sql
```

### Opción 3: Otorgar permisos al usuario actual

Si prefieres que el usuario `leandro_guias` pueda hacer migraciones:

```sql
GRANT ALTER ON `inventory-db`.* TO 'leandro_guias'@'%';
FLUSH PRIVILEGES;
```

Luego ejecuta:
```bash
python add_all_missing_columns.py
```

## Columnas que se agregan

| Columna | Tipo | Propósito |
|---------|------|-----------|
| `brand` | VARCHAR(255) | Marca del producto |
| `publish_event` | VARCHAR(100) | Estado de publicación |
| `meli_id` | VARCHAR(50) | ID de MercadoLibre |
| `drive_url` | TEXT | URL de carpeta en Google Drive |
| `status` | VARCHAR(50) | Estado actual en MeLi (active/paused) |
| `reason` | VARCHAR(255) | Razón de error si falla |
| `remedy` | VARCHAR(255) | Solución sugerida |

## Verificación

Después de ejecutar la migración, recarga el navegador en `http://localhost:8000` y deberías ver los productos listados.
