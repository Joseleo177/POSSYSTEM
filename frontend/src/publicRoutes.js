// src/publicRoutes.js
// Las rutas públicas (sin sesión). Las leen App.jsx, para elegir qué montar, y main.jsx, para
// no registrar el service worker del ERP en el teléfono de un cliente.

// El enlace lleva el nombre de la tienda (/catalogo/el-gran-terminal), así que el guion es
// parte de la dirección. Se pasa a minúsculas porque un enlace dictado por teléfono se
// escribe como sea y tiene que llegar igual a la tienda.
// La dirección admite dos formas: la tienda (/catalogo/el-gran-terminal) y la ficha de un
// producto (/catalogo/el-gran-terminal/p/45), que es el enlace que la tienda comparte por
// WhatsApp. El id inicial solo se lee aquí una vez; abrir y cerrar fichas navegando dentro
// del catálogo lo maneja usePublicCatalog con el historial del navegador.
export function getPublicCatalogRoute() {
    const m = window.location.pathname.match(/^\/catalogo\/([A-Za-z0-9-]+)(?:\/p\/(\d+))?\/?$/);
    return m ? { slug: m[1].toLowerCase(), productId: m[2] ? parseInt(m[2], 10) : null } : null;
}

// QR de la mesa (/mesa/<código>): el cliente ve cómo va su pedido. Igual que el catálogo, va
// fuera de la sesión.
export function getMesaRoute() {
    const m = window.location.pathname.match(/^\/mesa\/([A-Za-z0-9_-]{12,32})\/?$/);
    return m ? m[1] : null;
}

export const isPublicRoute = () => Boolean(getPublicCatalogRoute() || getMesaRoute());
