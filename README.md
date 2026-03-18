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
│       ├── config/             ← Configuración de Sequelize
│       ├── db/
│       │   ├── pool.js         ← Conexión Raw para transacciones críticas
│       │   └── init.sql        ← Tablas (18) + datos iniciales (Unificado)
│       ├── models/             ← Modelos Sequelize ORM
│       ├── controllers/        ← Controladores refactorizados a ORM
│       └── routes/             ← Definición de rutas API
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             ← UI principal
        └── services/
            └── api.js          ← Comunicación con el backend
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

## 🗄️ Base de Datos y ORM

El sistema utiliza **Sequelize ORM** para la mayoría de las operaciones, garantizando un código limpio y escalable. Para operaciones críticas de stock, se utilizan transacciones SQL puras.

Tablas principales (18 en total):

- **`products`** — Maestro de productos con costos y márgenes.
- **`warehouses` & `product_stock`** — Gestión multi-almacén.
- **`sales` & `sale_items`** — Ventas y detalle.
- **`purchases` & `purchase_items`** — Compras a proveedores.
- **`customers`** — Clientes y proveedores.
- **`banks` & `payment_methods`** — Finanzas dinámicas.
- **`currencies`** — Manejo de multimoneda y tasas de cambio.
- **`employees` & `roles`** — Gestión de usuarios y permisos.

El stock se gestiona automáticamente mediante transacciones PostgreSQL para evitar inconsistencias.

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
