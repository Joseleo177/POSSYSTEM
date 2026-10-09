#!/usr/bin/env bash
# Respaldo completo de Supabase a un archivo en POSSYSTEM/backups, con pg_dump en Docker.
# Correr desde Git Bash en la carpeta POSSYSTEM:
#
#   bash backend/migrations-sql/respaldar_supabase.sh
#
# Mismos datos de conexión que migrar_supabase.sh (pooler de Supabase). La clave no se guarda.
set -euo pipefail

cd "$(dirname "$0")/../.."   # carpeta POSSYSTEM
mkdir -p backups

read -rp "Host del pooler [aws-1-us-east-1.pooler.supabase.com]: " DB_HOST
DB_HOST=${DB_HOST:-aws-1-us-east-1.pooler.supabase.com}
read -rp "Puerto [5432]: " DB_PORT
DB_PORT=${DB_PORT:-5432}
read -rp "Usuario (postgres.<ref>): " DB_USER
read -rsp "Clave: " DB_PASSWORD; echo
read -rp "Base [postgres]: " DB_NAME
DB_NAME=${DB_NAME:-postgres}

ARCHIVO="supabase_antes_migracion_$(date +%Y%m%d_%H%M%S).dump"
echo "Respaldando en backups/$ARCHIVO …"

# Formato custom (-Fc): comprimido y restaurable tabla por tabla con pg_restore.
MSYS_NO_PATHCONV=1 docker run --rm -e PGPASSWORD="$DB_PASSWORD" -e PGSSLMODE=require \
  -v "$(pwd -W 2>/dev/null || pwd)/backups:/out" postgres:17-alpine \
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
          --schema=public --no-owner --no-privileges -Fc -f "/out/$ARCHIVO"

TAM=$(du -h "backups/$ARCHIVO" | cut -f1)
echo "Listo: backups/$ARCHIVO ($TAM)"
