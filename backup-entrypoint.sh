#!/bin/sh
set -e

BACKUP_DIR=/backups
KEEP_DAYS=${BACKUP_KEEP_DAYS:-7}
INTERVAL_HOURS=${BACKUP_INTERVAL_HOURS:-24}
DB_HOST=db

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $1"; }

do_backup() {
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  FILENAME="posdb_${TIMESTAMP}.sql.gz"
  log "Iniciando respaldo: $FILENAME"

  if pg_dump -h "$DB_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_DIR/$FILENAME"; then
    SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
    log "Respaldo completado: $FILENAME ($SIZE)"
    find "$BACKUP_DIR" -name "posdb_*.sql.gz" -mtime "+$KEEP_DAYS" -delete
    log "Limpieza completada — retención: ${KEEP_DAYS} días"
  else
    log "ERROR: El respaldo falló"
    rm -f "$BACKUP_DIR/$FILENAME"
  fi
}

log "Servicio de respaldo iniciado (cada ${INTERVAL_HOURS}h, retención ${KEEP_DAYS} días)"
do_backup

INTERVAL_SECS=$((INTERVAL_HOURS * 3600))
ELAPSED=0

while true; do
  sleep 60
  ELAPSED=$((ELAPSED + 60))

  if [ -f "$BACKUP_DIR/.trigger" ]; then
    rm -f "$BACKUP_DIR/.trigger"
    log "Respaldo manual disparado desde la UI"
    do_backup
    ELAPSED=0
  fi

  if [ "$ELAPSED" -ge "$INTERVAL_SECS" ]; then
    log "Respaldo automático programado"
    do_backup
    ELAPSED=0
  fi
done
