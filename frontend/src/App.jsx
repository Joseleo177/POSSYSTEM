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
function getPublicCatalogToken() {
    const m = window.location.pathname.match(/^\/catalogo\/([A-Za-z0-9]+)\/?$/);
    return m ? m[1] : null;
}

export default function App() {
    const catalogToken = getPublicCatalogToken();

    if (catalogToken) {
        return (
            <ErrorBoundary>
                <PublicCatalogPage token={catalogToken} />
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