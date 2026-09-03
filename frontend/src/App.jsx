// src/App.jsx
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import ErrorBoundary from "./components/ErrorBoundary";
import PosApp from "./components/PosApp";
import PublicCatalogPage from "./pages/PublicCatalogPage";

// El proyecto no usa react-router: PosApp maneja toda la navegación interna. Para el
// catálogo público basta con mirar la URL una vez, antes de montar nada.
//
// Tiene que quedar FUERA de AppProvider/CartProvider: esos contextos piden sesión al
// arrancar y mandarían al login a un cliente que solo abrió el enlace.
// El enlace lleva el nombre de la tienda (/catalogo/el-gran-terminal), así que el guion es
// parte de la dirección. Se pasa a minúsculas porque un enlace dictado por teléfono se
// escribe como sea y tiene que llegar igual a la tienda.
// La dirección admite dos formas: la tienda (/catalogo/el-gran-terminal) y la ficha de un
// producto (/catalogo/el-gran-terminal/p/45), que es el enlace que la tienda comparte por
// WhatsApp. El id inicial solo se lee aquí una vez; abrir y cerrar fichas navegando dentro
// del catálogo lo maneja usePublicCatalog con el historial del navegador.
function getPublicCatalogRoute() {
    const m = window.location.pathname.match(/^\/catalogo\/([A-Za-z0-9-]+)(?:\/p\/(\d+))?\/?$/);
    return m ? { slug: m[1].toLowerCase(), productId: m[2] ? parseInt(m[2], 10) : null } : null;
}

export default function App() {
    const catalogRoute = getPublicCatalogRoute();

    if (catalogRoute) {
        return (
            <ErrorBoundary>
                <PublicCatalogPage token={catalogRoute.slug} initialProductId={catalogRoute.productId} />
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary>
            <AppProvider>
                <CartProvider>
                    <PosApp />
                </CartProvider>
            </AppProvider>
        </ErrorBoundary>
    );
}