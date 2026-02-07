-- Migration Script for product_catalog_sync table
-- Execute this in Cloud SQL console or with a user that has ALTER privileges
-- Date: 2026-02-04

-- Add missing columns for MercadoLibre integration and product management

-- 1. Brand column
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS brand VARCHAR(255) 
COMMENT 'Marca del producto';

-- 2. Publish event tracking
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS publish_event VARCHAR(100) 
COMMENT 'Estado de publicación: Publicado o Despublicado';

-- 3. MercadoLibre ID
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS meli_id VARCHAR(50) 
COMMENT 'ID de la publicación en MercadoLibre';

-- 4. Google Drive URL for photos
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS drive_url TEXT 
COMMENT 'URL de la carpeta de Google Drive con fotos del producto';

-- 5. MercadoLibre Status
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) 
COMMENT 'Estado actual en MercadoLibre (active, paused, etc)';

-- 6. Error reason from MercadoLibre
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS reason VARCHAR(255) 
COMMENT 'Razón del error si falla la publicación';

-- 7. Remedy suggestion from MercadoLibre
ALTER TABLE product_catalog_sync 
ADD COLUMN IF NOT EXISTS remedy VARCHAR(255) 
COMMENT 'Solución sugerida por MercadoLibre para el error';

-- Verify columns were added
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_COMMENT
FROM 
    INFORMATION_SCHEMA.COLUMNS
WHERE 
    TABLE_SCHEMA = 'inventory-db' 
    AND TABLE_NAME = 'product_catalog_sync'
    AND COLUMN_NAME IN ('brand', 'publish_event', 'meli_id', 'drive_url', 'status', 'reason', 'remedy')
ORDER BY 
    ORDINAL_POSITION;
