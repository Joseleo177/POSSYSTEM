import DefaultLayout from "./default/CatalogLayout";
import BoutiqueLayout from "./boutique/CatalogLayout";
import MenuLayout from "./menu/CatalogLayout";

// Temas del catálogo público. Cada tienda elige el suyo con el ajuste `catalog_theme`, y
// aquí se traduce ese nombre al juego de componentes que se monta.
//
// El servidor no valida contra esta lista a propósito: solo sanea el formato del valor. Si
// validara los nombres habría que tocar backend y frontend cada vez que se agrega un tema, y
// bastaría con olvidar uno de los dos para que una tienda quedara con la vitrina cambiada sin
// explicación. Aquí un nombre desconocido cae al tema estándar, que es el comportamiento
// correcto tanto para un ajuste mal escrito como para una versión vieja del frontend a la que
// todavía no llegó el tema nuevo.
//
// Un tema es SOLO presentación: recibe `catalog` (lo que devuelve usePublicCatalog) y `token`.
// No consulta la API ni decide reglas de negocio.
const THEMES = {
    default: DefaultLayout,
    // Vitrina con forma de tienda de marca: anuncio, carrusel de portada, categorías con
    // foto y fichas con marca, beneficio y precio tachado. Se alimenta del contenido que la
    // tienda carga en Ajustes → Vitrina.
    boutique: BoutiqueLayout,
    // Carta de restaurante: mosaicos de "tipos de comida" como puerta de entrada, y dentro
    // de cada uno una lista de platos en filas. Fondo oscuro fijo, no ligado al claro/oscuro
    // del visitante — es la identidad del tema, no una preferencia de accesibilidad.
    menu: MenuLayout,
};

export const DEFAULT_THEME = "default";

export function resolveTheme(name) {
    return THEMES[name] || THEMES[DEFAULT_THEME];
}

export default THEMES;
