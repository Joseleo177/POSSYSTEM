// src/App.jsx
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { getPublicCatalogRoute, getMesaRoute } from "./publicRoutes";

// El proyecto no usa react-router: PosApp maneja toda la navegación interna. Para el
// catálogo público basta con mirar la URL una vez, antes de montar nada.
//
// Tiene que quedar FUERA de AppProvider/CartProvider: esos contextos piden sesión al
// arrancar y mandarían al login a un cliente que solo abrió el enlace.
//
// Cada entrada se carga aparte (lazy): el cliente que abre una vitrina desde el teléfono
// baja solo la vitrina, no el ERP entero. La ruta se decide una sola vez al abrir, así que
// no hay cambios de pantalla que esperen una descarga a mitad de uso.
const ErpApp = lazy(() => import("./ErpApp"));
const PublicCatalogPage = lazy(() => import("./pages/PublicCatalogPage"));
const MesaPublicPage = lazy(() => import("./pages/MesaPublicPage"));

export default function App() {
    const catalogRoute = getPublicCatalogRoute();
    const mesaToken = getMesaRoute();

    let page;
    if (mesaToken) page = <MesaPublicPage token={mesaToken} />;
    else if (catalogRoute) page = <PublicCatalogPage token={catalogRoute.slug} initialProductId={catalogRoute.productId} />;
    else page = <ErpApp />;

    // Sin indicador de carga: la descarga dura un instante y un parpadeo de spinner se ve peor
    // que la pantalla vacía de siempre mientras arranca React.
    return (
        <ErrorBoundary>
            <Suspense fallback={null}>
                {page}
            </Suspense>
        </ErrorBoundary>
    );
}
