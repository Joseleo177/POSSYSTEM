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
//
// Un despliegue cambia los nombres de esos archivos. Quien tenía la página abierta (o la sacó
// de la caché) pide el nombre viejo, que ya no existe: "Failed to fetch dynamically imported
// module". Se recarga UNA vez para traer el index.html nuevo; la marca en sessionStorage evita
// un ciclo de recargas si el fallo es otro (sin internet), y en ese caso se ve el error.
const RECARGA = "nxus_recarga_por_despliegue";
const cargar = (importar) => lazy(() => importar().then(
    (m) => { try { sessionStorage.removeItem(RECARGA); } catch { /* modo privado */ } return m; },
    (err) => {
        let yaRecargo = true;
        try { yaRecargo = !!sessionStorage.getItem(RECARGA); sessionStorage.setItem(RECARGA, "1"); } catch { /* modo privado */ }
        if (yaRecargo) throw err;
        window.location.reload();
        return new Promise(() => {}); // la recarga ya está en curso
    }
));

const ErpApp = cargar(() => import("./ErpApp"));
const PublicCatalogPage = cargar(() => import("./pages/PublicCatalogPage"));
const MesaPublicPage = cargar(() => import("./pages/MesaPublicPage"));

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
