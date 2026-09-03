import { useEffect } from "react";
import { usePublicCatalog } from "../hooks/usePublicCatalog";
import { resolveTheme } from "./catalogThemes";

// Página que ve el cliente final. Vive fuera de AppProvider/CartProvider: no hay sesión
// ni permisos, y el carrito de aquí no es el del punto de venta — es una lista que solo
// existe en el navegador del cliente y termina como pedido en el sistema del comercio. No
// se crea ninguna venta ni se aparta inventario: eso lo hace el comercio a mano.
//
// El estado vive en usePublicCatalog y la maquetación en catalogThemes/. Aquí solo queda
// elegir con qué tema se pinta: una tienda puede tener vitrina propia sin que se duplique
// una línea de lógica, porque el hook se llama UNA vez, aquí, y el tema solo recibe el
// resultado.
export default function PublicCatalogPage({ token, initialProductId = null }) {
    const catalog = usePublicCatalog(token, initialProductId);

    // El tema viaja dentro de la cabecera de la tienda, así que en la primera carga todavía
    // no se sabe cuál es. Se recuerda el de la visita anterior para no pintar medio segundo
    // el tema estándar antes de cambiar a la vitrina de la tienda: es un dato de vitrina, no
    // hay nada que proteger en creerle al navegador, y si cambió, la respuesta del servidor
    // lo corrige en cuanto llega.
    //
    // Por token: el mismo navegador puede tener abiertas dos tiendas con temas distintos.
    const recordado = (() => {
        try { return localStorage.getItem(`catalog_theme_${token}`) || null; }
        catch { return null; } // modo privado
    })();

    const nombreTema = catalog.store?.theme ?? recordado;

    useEffect(() => {
        const t = catalog.store?.theme;
        if (t === undefined) return; // la tienda todavía no cargó
        try {
            if (t) localStorage.setItem(`catalog_theme_${token}`, t);
            else localStorage.removeItem(`catalog_theme_${token}`);
        } catch { /* modo privado */ }
    }, [catalog.store?.theme, token]);

    const Layout = resolveTheme(nombreTema);

    return <Layout catalog={catalog} token={token} />;
}
