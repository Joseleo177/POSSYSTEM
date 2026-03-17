# 🏪 Mi Tienda POS

Sistema de Punto de Venta con arquitectura separada: **Backend API REST** + **Frontend React** + **PostgreSQL**, todo orquestado con **Docker Compose**.

---

## 📁 Estructura del Proyecto

```
pos-system/
├── docker-compose.yml          ← Orquestación de los 3 servicios
├── .env.example                ← Variables de entorno (copiar a .env)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            ← Entrada Express
│       ├── db/
│       │   ├── pool.js         ← Conexión PostgreSQL
│       │   └── init.sql        ← Tablas + datos de ejemplo
│       ├── controllers/
│       │   ├── products.js
│       │   ├── sales.js
│       │   └── categories.js
│       └── routes/
│           ├── products.js
│           ├── sales.js
│           └── categories.js
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             ← UI principal
        └── services/
            └── api.js          ← Capa de comunicación con el backend
```

---

## 🚀 Inicio rápido

### 1. Requisitos previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo.

### 2. Clonar / descargar el proyecto

```bash
cd pos-system
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env si deseas cambiar contraseñas
```

### 4. Levantar todo con Docker Compose

```bash
docker compose up --build
```

> La primera vez tarda ~2 minutos mientras descarga imágenes e instala dependencias.

### 5. Abrir la aplicación

| Servicio   | URL                          |
|------------|------------------------------|
| Frontend   | http://localhost:3000        |
| Backend API| http://localhost:4000/api    |
| Health     | http://localhost:4000/health |
| PostgreSQL  | localhost:5432               |

---

## 🔌 API Endpoints

### Productos
| Método | Ruta                  | Descripción             |
|--------|-----------------------|-------------------------|
| GET    | `/api/products`       | Listar (con ?search=)   |
| GET    | `/api/products/:id`   | Obtener uno             |
| POST   | `/api/products`       | Crear                   |
| PUT    | `/api/products/:id`   | Actualizar              |
| DELETE | `/api/products/:id`   | Eliminar                |

### Ventas
| Método | Ruta              | Descripción              |
|--------|-------------------|--------------------------|
| GET    | `/api/sales`      | Historial de ventas      |
| GET    | `/api/sales/stats`| Estadísticas generales   |
| POST   | `/api/sales`      | Registrar nueva venta    |

### Categorías
| Método | Ruta               | Descripción       |
|--------|--------------------|-------------------|
| GET    | `/api/categories`  | Listar categorías |
| POST   | `/api/categories`  | Crear categoría   |

---

## 🗄️ Base de Datos

Tablas principales:

- **`categories`** — Categorías de productos
- **`products`** — Productos con precio y stock
- **`sales`** — Cabecera de cada venta
- **`sale_items`** — Líneas de detalle por venta (con snapshot de precio)

El stock se descuenta automáticamente en cada venta usando una **transacción PostgreSQL**.

---

## 🛑 Comandos útiles

```bash
# Detener todo
docker compose down

# Detener y borrar la base de datos (¡borra todos los datos!)
docker compose down -v

# Ver logs en tiempo real
docker compose logs -f

# Ver logs solo del backend
docker compose logs -f backend

# Reiniciar solo el frontend
docker compose restart frontend
```

---

## 🔧 Desarrollo sin Docker

**Backend:**
```bash
cd backend
npm install
# Configura un .env con tus credenciales locales de Postgres
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
