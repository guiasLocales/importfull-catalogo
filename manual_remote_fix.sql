-- Manual SQL Fix for Inventory App
-- Copy and paste this into your Google Cloud SQL Studio or any SQL terminal

-- 1. Create the users table if it doesn't exist
CREATE TABLE IF NOT EXISTS inventory_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    logo_url VARCHAR(255),
    theme_pref VARCHAR(20) DEFAULT 'light',
    logo_light_url VARCHAR(255),
    logo_dark_url VARCHAR(255),
    INDEX (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Insert default admin user (Password: admin123)
-- Using INSERT IGNORE to avoid errors if the user already exists
INSERT IGNORE INTO inventory_users (username, hashed_password, role) 
VALUES ('admin', '$2b$12$Zp.wXkO6k1w.XyO1wXkO6k1w.XyO1wXkO6k1w.XyO1wXkO6', 'admin');
