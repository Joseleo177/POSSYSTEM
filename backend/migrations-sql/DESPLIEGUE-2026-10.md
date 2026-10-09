# Despliegue de octubre 2026: conciliación bancaria y diario = cuenta

Cuatro migraciones nuevas, en este orden:

| Migración | Qué hace | ¿Se puede deshacer? |
|---|---|---|
| `20261006100000-bank-reconciliation` | Tablas de extractos, líneas y casamientos; permiso `accounting.reconcile` | Sí |
| `20261006120000-journal-direction` | Sentido del dinero por diario (paso intermedio) | Sí |
| `20261006140000-journal-accounts` | El diario pasa a ser la cuenta: crea `payment_journal_methods`, guarda el método en cada movimiento y **fusiona** los diarios del mismo banco, moneda y sucursales | **No**: solo restaurando el respaldo |
| `20261009100000-reconciliation-grouped-charges` | Permite que las comisiones de un extracto se registren en un solo egreso | Sí |

La tercera mueve cobros, egresos, ingresos, pagos a proveedor y arqueos de un diario a otro. Por eso se corre con `db:migrate` (el mismo código que ya se probó en local) y no copiando SQL a mano.

## Orden

### 1. Respaldo de Supabase
Desde el panel de Supabase (Database → Backups) o con `pg_dump` contra la conexión directa. Sin respaldo no se sigue: la fusión no tiene vuelta atrás automática.

### 2. Revisar qué se va a fusionar
Correr `20261009-1-vista-previa-fusion-diarios.sql` en el editor SQL (solo lee). Cada fila es un grupo de diarios que van a quedar como una sola cuenta. Si dos diarios de un grupo son cuentas bancarias **distintas** (por ejemplo, dos cuentas del Banco de Venezuela), separarlos antes de migrar: asignarles sucursales distintas en Diarios.

### 3. Hora sin ventas
Entre la migración y el despliegue del backend nuevo, el backend viejo de Vercel no conoce las columnas nuevas. Hacerlo fuera de horario y desplegar enseguida.

### 4. Migrar desde el contenedor
Con la **conexión directa** de Supabase (puerto 5432, no el pooler 6543: el pooler rompe el DDL en transacción). Los valores salen de Supabase → Project Settings → Database.

```bash
cd POSSYSTEM
docker compose run --rm \
  -e NODE_ENV=production \
  -e DB_HOST=db.<proyecto>.supabase.co \
  -e DB_PORT=5432 \
  -e DB_NAME=postgres \
  -e DB_USER=postgres \
  -e DB_PASSWORD='<clave>' \
  backend npx sequelize-cli db:migrate
```

`NODE_ENV=production` activa el SSL. La salida tiene que listar las cuatro migraciones como `migrated` y, para cada empresa con diarios fusionados, una línea `[journal-accounts] empresa N: diarios … fusionados en …`. Guardar esa salida.

> No correr además `20261006100000-bank-reconciliation.sql`: es la alternativa manual de la primera migración y `db:migrate` ya la aplica.

### 5. RLS y verificación
Correr `20261009-2-rls-y-verificacion.sql`. Activa RLS en las cuatro tablas nuevas y trae seis consultas; cada una dice en su comentario qué tiene que dar.

### 6. Desplegar
Primero el backend (Vercel), después el frontend. El frontend nuevo trae `pdfjs-dist` (lector de PDF del BDV): se instala solo en el build.

### 7. Revisar en la app
- **Diarios:** las cuentas fusionadas muestran sus métodos (p. ej. Banco de Venezuela: Pago móvil · Punto de venta (solo recibe) · Biopago (solo recibe)). Revisar el sentido de cada método.
- **Cobro:** un cobro por punto o biopago entra a la cuenta del banco con su método.
- **Conciliación:** subir un extracto de prueba y deshacer.

## Si algo sale mal
Restaurar el respaldo del paso 1 y volver a desplegar la versión anterior del backend. No intentar deshacer la fusión a mano.
