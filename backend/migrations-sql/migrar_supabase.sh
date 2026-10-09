#!/usr/bin/env bash
# Corre las migraciones pendientes (db:migrate) contra Supabase desde el contenedor del backend.
# Ver DESPLIEGUE-2026-10.md. Correr desde Git Bash en la carpeta POSSYSTEM:
#
#   bash backend/migrations-sql/migrar_supabase.sh
#
# Pide los datos de conexión al ejecutarse; la clave no se guarda en ningún archivo.
# Se usa el pooler de Supabase (Project Settings → Database → Connection pooling):
#   host  aws-1-us-east-1.pooler.supabase.com
#   puerto 5432 (modo sesión, el indicado para migraciones). Si te cierra la conexión, 6543.
#   usuario postgres.<ref del proyecto>
set -euo pipefail

cd "$(dirname "$0")/../.."   # carpeta POSSYSTEM

read -rp "Host del pooler [aws-1-us-east-1.pooler.supabase.com]: " DB_HOST
DB_HOST=${DB_HOST:-aws-1-us-east-1.pooler.supabase.com}
read -rp "Puerto [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}
read -rp "Usuario (postgres.<ref>): " DB_USER
read -rsp "Clave: " DB_PASSWORD; echo
read -rp "Base [postgres]: " DB_NAME
DB_NAME=${DB_NAME:-postgres}

echo
echo "Se va a migrar ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}."
echo "¿Hiciste el respaldo y revisaste la vista previa de la fusión? (escribe SI para seguir)"
read -r ok
[ "$ok" = "SI" ] || { echo "Cancelado."; exit 1; }

docker compose build backend
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps \
  -e NODE_ENV=production \
  -e DB_HOST="$DB_HOST" -e DB_PORT="$DB_PORT" -e DB_NAME="$DB_NAME" \
  -e DB_USER="$DB_USER" -e DB_PASSWORD="$DB_PASSWORD" \
  backend npx sequelize-cli db:migrate 2>&1 | tee "migracion_supabase_$(date +%Y%m%d_%H%M%S).log"

echo
echo "Listo. Guarda el .log que quedó en POSSYSTEM y corre 20261009-2-rls-y-verificacion.sql."
