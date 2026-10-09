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

### 1. Respaldo de Supabase, justo antes de migrar
Un respaldo de horas antes no sirve: restaurarlo perdería las ventas del día. Dos capas:
- **Obligatorio:** `20261009-0b-respaldo-antes-de-migrar.sql` en el editor SQL. Copia lo que toca la migración (diarios, a qué diario apunta cada cobro, egreso, ingreso, pago a proveedor y venta, arqueos y roles) en el esquema `respaldo_20261009`. La última consulta tiene que dar 0 en todas las filas.
- **Si conecta:** `bash backend/migrations-sql/respaldar_supabase.sh` deja un respaldo completo en `backups/` (ignorado por git).

### 2. Migraciones pendientes
Correr `20261009-0-migraciones-pendientes.sql` en el editor SQL (solo lee). Tiene que listar **solo** las cuatro de la tabla de arriba. Si aparece otra, parar: `db:migrate` también la correría.

### 3. Revisar qué se va a fusionar
Correr `20261009-1-vista-previa-fusion-diarios.sql` (solo lee). Cada fila es un grupo de diarios que van a quedar como una sola cuenta. Si dos diarios de un grupo son cuentas bancarias **distintas** (por ejemplo, dos cuentas del Banco de Venezuela), separarlos antes de migrar: asignarles sucursales distintas en Diarios.

### 4. Migrar (fuera de horario de ventas)
Entre la migración y el despliegue del backend nuevo, el backend viejo de Vercel no conoce las columnas nuevas: hacerlo sin ventas en curso y desplegar enseguida.

Desde Git Bash, en la carpeta `POSSYSTEM`:

```bash
bash backend/migrations-sql/migrar_supabase.sh
```

Pide host, puerto, usuario y clave del **pooler** de Supabase (Project Settings → Database → Connection pooling): host `aws-1-us-east-1.pooler.supabase.com`, puerto 5432 (modo sesión; si cierra la conexión, 6543), usuario `postgres.<ref>`. Corre `db:migrate` en el contenedor con `NODE_ENV=production` (SSL) y guarda la salida en un `.log`. Tiene que listar las cuatro migraciones como `migrated` y, por cada empresa con diarios fusionados, una línea `[journal-accounts] empresa N: diarios … fusionados en …`.

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
