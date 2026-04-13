# POS System v3

Sistema de punto de venta (POS) con gestión de inventario, contabilidad y ventas.

## Modos de ejecución

El sistema es **híbrido**: puede correr en dos modos según tus necesidades.

| Modo | Base de datos | Cuándo usarlo |
|------|--------------|---------------|
| **Local / Docker** | PostgreSQL en contenedor | Desarrollo, uso sin internet |
| **Nube / Supabase** | Supabase (PostgreSQL gestionado) | Producción, múltiples PC |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- Git

---

## Modo 1 — Docker local (recomendado para empezar)

Todo corre en tu PC: backend, frontend y base de datos PostgreSQL.

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO>
cd pos-system-v3
```

### 2. Configurar variables de entorno

```bash
cd POSSYSTEM
cp .env.example .env
```

Edita `.env` y cambia al menos:
- `POSTGRES_PASSWORD` — contraseña segura para la BD
- `JWT_SECRET` — string aleatorio de mínimo 32 caracteres

### 3. Levantar los contenedores

```bash
cd POSSYSTEM
docker compose up -d --build
```

Esto levanta tres servicios:
- **db** — PostgreSQL en puerto `5433` (configurable)
- **backend** — API Node.js en puerto `4000`
- **frontend** — React + nginx en puerto `3001`

### 4. Acceder al sistema

Abre [http://localhost:3001](http://localhost:3001) en tu navegador.

Las migraciones se ejecutan automáticamente al iniciar el backend.

### Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f

# Ver logs solo del backend
docker compose logs -f backend

# Detener todo
docker compose down

# Detener y borrar la base de datos (cuidado: pierde todos los datos)
docker compose down -v
```

---

## Modo 2 — Nube con Supabase

Usa una base de datos Supabase en la nube. Útil para producción o para trabajar desde varias PCs.

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto
2. Obtén la **URL del proyecto** y la **Service Role Key** (en Settings > API)

### 2. Configurar variables de entorno

```bash
cd POSSYSTEM
cp .env.example .env
```

Edita `.env` y agrega:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...

# Puedes dejar las variables POSTGRES_* con cualquier valor
# (no se usarán cuando Supabase esté configurado)
```

### 3. Ejecutar migraciones en Supabase

Antes de levantar los contenedores, ejecuta las migraciones contra Supabase:

```bash
cd POSSYSTEM/backend
# Exporta las variables necesarias
export DATABASE_URL="postgresql://postgres:<password>@<host>:5432/postgres"
npx sequelize-cli db:migrate --env production
```

### 4. Levantar los servicios

```bash
cd POSSYSTEM
docker compose up -d --build
```

El backend detectará automáticamente `SUPABASE_URL` y se conectará a Supabase en lugar del contenedor `db`.

---

## Desarrollo local (sin Docker)

Para trabajar en el código con hot-reload:

### Backend

```bash
cd POSSYSTEM/backend
npm install
# Asegúrate de tener PostgreSQL corriendo o usa el contenedor db
npm run dev
```

### Frontend

```bash
cd POSSYSTEM/frontend
npm install
# Por defecto hace proxy a http://localhost:4000
npm run dev
```

Si el backend corre en un puerto diferente, crea un archivo `.env.local` en `frontend/`:

```env
VITE_BACKEND_URL=http://localhost:4000
```

---

## Estructura del proyecto

```
pos-system-v3/
└── POSSYSTEM/
    ├── backend/          # API Node.js + Express + Sequelize
    │   ├── src/
    │   │   ├── controllers/
    │   │   ├── models/
    │   │   ├── migrations/
    │   │   ├── routes/
    │   │   └── services/
    │   └── Dockerfile
    ├── frontend/         # React + Vite + Tailwind
    │   ├── src/
    │   │   ├── components/
    │   │   ├── pages/
    │   │   └── api/
    │   ├── nginx.conf
    │   └── Dockerfile
    ├── docker-compose.yml
    └── .env.example
```

---

## Variables de entorno — referencia completa

Ver [POSSYSTEM/.env.example](POSSYSTEM/.env.example) para la lista completa con descripciones.

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `POSTGRES_DB` | Nombre de la base de datos | Modo local |
| `POSTGRES_USER` | Usuario PostgreSQL | Modo local |
| `POSTGRES_PASSWORD` | Contraseña PostgreSQL | Modo local |
| `JWT_SECRET` | Secret para tokens JWT (min 32 chars) | Siempre |
| `CORS_ORIGIN` | Origen permitido para CORS (`*` o dominio) | Siempre |
| `SUPABASE_URL` | URL del proyecto Supabase | Solo nube |
| `SUPABASE_SERVICE_KEY` | Service Role Key de Supabase | Solo nube |
| `FRONTEND_PORT` | Puerto del frontend en tu PC (default: 3001) | Opcional |
| `BACKEND_PORT` | Puerto del backend en tu PC (default: 4000) | Opcional |
