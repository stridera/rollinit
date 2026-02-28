#!/usr/bin/env bash
# One-time server setup for RollInit
# Run as: ssh strider@stridera 'bash -s' < scripts/setup-server.sh
set -euo pipefail

APP_DIR="/var/www/rollinit.app"
APP_PORT=3200
DB_NAME="rollinit"
DB_USER="rollinit"

echo "=== RollInit Server Setup ==="

# --- Node.js 22 LTS ---
if command -v node &>/dev/null; then
    echo "[ok] Node.js already installed: $(node --version)"
else
    echo "[*] Installing Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "[ok] Node.js installed: $(node --version)"
fi

# --- PostgreSQL ---
if command -v psql &>/dev/null && sudo systemctl is-active --quiet postgresql; then
    echo "[ok] PostgreSQL already installed and running"
else
    echo "[*] Installing PostgreSQL..."
    sudo apt-get update
    sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    echo "[ok] PostgreSQL installed and started"
fi

# --- Create database and user ---
echo "[*] Setting up database..."
DB_PASS=$(openssl rand -base64 24)

# Create user if not exists, create database if not exists
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
    ELSE
        ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
    END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
echo "[ok] Database '${DB_NAME}' ready (user: ${DB_USER})"

# --- pm2 ---
if command -v pm2 &>/dev/null; then
    echo "[ok] pm2 already installed"
else
    echo "[*] Installing pm2..."
    sudo npm install -g pm2
    # Set pm2 to start on boot
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u strider --hp /home/strider
    echo "[ok] pm2 installed"
fi

# --- Apache proxy modules ---
echo "[*] Enabling Apache proxy modules..."
sudo a2enmod proxy proxy_http proxy_wstunnel headers rewrite
echo "[ok] Apache modules enabled"

# --- Update Apache SSL vhost for reverse proxy ---
echo "[*] Configuring Apache reverse proxy..."
sudo tee /etc/apache2/sites-available/rollinit.app-le-ssl.conf > /dev/null <<APACHE
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName rollinit.app
    ServerAlias www.rollinit.app
    ServerAdmin webmaster@rollinit.app
    ErrorLog \${APACHE_LOG_DIR}/rollinit.app_error.log
    CustomLog \${APACHE_LOG_DIR}/rollinit.app_access.log combined

    # Reverse proxy to Node.js
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:${APP_PORT}/
    ProxyPassReverse / http://127.0.0.1:${APP_PORT}/

    # WebSocket support for Socket.io
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:${APP_PORT}/\$1 [P,L]

    # Headers
    RequestHeader set X-Forwarded-Proto "https"

    Include /etc/letsencrypt/options-ssl-apache.conf
    SSLCertificateFile /etc/letsencrypt/live/rollinit.app/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/rollinit.app/privkey.pem
</VirtualHost>
</IfModule>
APACHE

# Also update the HTTP vhost to redirect properly
sudo tee /etc/apache2/sites-available/rollinit.app.conf > /dev/null <<APACHE
<VirtualHost *:80>
    ServerName rollinit.app
    ServerAlias www.rollinit.app
    ServerAdmin webmaster@rollinit.app
    ErrorLog \${APACHE_LOG_DIR}/rollinit.app_error.log
    CustomLog \${APACHE_LOG_DIR}/rollinit.app_access.log combined

    RewriteEngine On
    RewriteCond %{SERVER_NAME} =rollinit.app [OR]
    RewriteCond %{SERVER_NAME} =www.rollinit.app
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
APACHE

sudo systemctl restart apache2
echo "[ok] Apache configured and restarted"

# --- App directory ---
echo "[*] Setting up app directory..."
sudo chown -R strider:strider ${APP_DIR}
rm -rf ${APP_DIR}/index.html  # remove old placeholder

if [ ! -d "${APP_DIR}/.git" ]; then
    echo "[*] Cloning repository..."
    git clone https://github.com/stridera/rollinit.git ${APP_DIR}
else
    echo "[ok] Repository already cloned"
fi

# --- Create .env file ---
ENV_FILE="${APP_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    cat > "${ENV_FILE}" <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
PORT=${APP_PORT}
HOSTNAME=127.0.0.1
NODE_ENV=production
ENV
    echo "[ok] Created ${ENV_FILE}"
else
    echo "[ok] ${ENV_FILE} already exists (not overwriting)"
    echo "[!] New DB password: ${DB_PASS}"
    echo "    Update DATABASE_URL in ${ENV_FILE} if needed"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Verify .env file: cat ${APP_DIR}/.env"
echo "  2. Run the deploy script to build and start the app"
echo ""
echo "Database credentials:"
echo "  User: ${DB_USER}"
echo "  Pass: ${DB_PASS}"
echo "  DB:   ${DB_NAME}"
echo ""
echo "Save these credentials somewhere safe!"
