#!/bin/bash
# Script de backup de PostgreSQL
# Uso: ./backup.sh
# Recomendado colocar en crontab: 0 2 * * * /ruta/al/proyecto/backend/src/db/backup.sh

BACKUP_DIR="/var/backups/pos_db"
mkdir -p "$BACKUP_DIR"

# Variables de Base de datos (asegúrate de que correspondan a tu .env o docker)
DB_USER=${DB_USER:-"posuser"}
DB_NAME=${DB_NAME:-"posdb"}
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"5432"}

DATE=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/posdb_backup_$DATE.sql.gz"

echo "Iniciando backup de la base de datos $DB_NAME en $DB_HOST..."

# Ejecutar pg_dump y comprimir con gzip
pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" | gzip > "$FILENAME"

if [ $? -eq 0 ]; then
  echo "✅ Backup completado exitosamente: $FILENAME"
  
  # Opcional: Eliminar backups más antiguos de 30 días
  find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -exec rm {} \;
  echo "🧹 Backups antiguos limpiados."
else
  echo "❌ Error al realizar el backup."
  exit 1
fi
