# 🏪 POS System v3

Sistema de Punto de Venta con arquitectura moderna: **Backend API REST (Node/Express)** + **Frontend React (Vite)** + **PostgreSQL**, todo orquestado con **Docker Compose**.

---

## 🚀 Inicio rápido (cualquier PC)

### Requisitos previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo.
- Git

### 1. Clonar el repositorio

```bash
git clone https://github.com/Joseleo177/POSSYSTEM.git
cd POSSYSTEM
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

> Edita `.env` si necesitas cambiar contraseñas o puertos (por ejemplo si el puerto `5432` ya está en uso, cambia `POSTGRES_HOST_PORT=5433`).

### 3. Levantar todo con Docker

```bash
docker compose up --build
```

> La primera vez tarda ~3 minutos mientras descarga imágenes e instala dependencias. Las migraciones y datos iniciales se aplican automáticamente.

### 4. Abrir la aplicación

| Servicio    | URL                          |
|-------------|------------------------------|
| Frontend    | http://localhost:3001        |
| Backend API | http://localhost:4000/api    |
| Health      | http://localhost:4000/health |

### 5. Credenciales por defecto

| Campo      | Valor      |
|------------|------------|
| Usuario    | `admin`    |
| Contraseña | `admin1234`|

---

## 📁 Estructura del proyecto

```
POSSYSTEM/
├── docker-compose.yml       ← Orquestación de los 3 servicios
├── .env.example             ← Variables de entorno (copiar a .env)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js         ← Entrada Express
│       ├── config/          ← Configuración de Sequelize
│       ├── controllers/     ← Lógica de negocio
│       ├── models/          ← Modelos Sequelize ORM
│       ├── migrations/      ← Migraciones de BD (orden cronológico)
│       └── routes/          ← Definición de rutas API
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js       ← Proxy /api → backend
    └── src/
        ├── App.jsx
        ├── pages/
        ├── components/
        └── services/
            └── api.js       ← Comunicación con el backend
```

---

## 🛑 Comandos útiles

```bash
# Ver estado de contenedores
docker compose ps

# Ver logs en tiempo real
docker compose logs -f

# Ver logs solo del backend
docker compose logs -f backend

# Reiniciar solo el backend
docker compose restart backend

# Detener todo (conserva la BD)
docker compose down

# Detener y BORRAR la base de datos (¡resetea todo!)
docker compose down -v
```

---

## ⚠️ Conflicto de puertos

Si ya tienes otro servicio usando los puertos por defecto, edita `.env`:

```env
POSTGRES_HOST_PORT=5433   # si 5432 está ocupado
FRONTEND_PORT=3002        # si 3001 está ocupado
BACKEND_PORT=4001         # si 4000 está ocupado
```

---

## 🗄️ Roles y permisos

| Rol        | Acceso                                         |
|------------|-----------------------------------------------|
| `admin`    | Todo el sistema                               |
| `manager`  | Ventas, reportes, configuración, clientes     |
| `cashier`  | POS de ventas, clientes                       |
| `warehouse`| Productos, inventario, categorías             |

---

## 🔒 Seguridad en producción

Antes de deployar en producción:
1. Cambia `JWT_SECRET` por un string aleatorio largo y seguro
2. Cambia las contraseñas de la BD (`POSTGRES_PASSWORD`)
3. Configura `CORS_ORIGIN` con tu dominio real (ej: `https://mitienda.com`)
4. Cambia `NODE_ENV=production`
