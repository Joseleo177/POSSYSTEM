// Pinta el fondo del DOCUMENTO (html y body) y el color de la barra del navegador con el de la
// página pública que se está viendo, y devuelve cómo dejarlo como estaba.
//
// Por qué (31-10-2026, página de la mesa en un iPhone en modo oscuro): con viewport-fit=cover y
// la barra de Safari/Brave abajo, lo que queda fuera del alto de la página —la franja sobre la
// barra, el rebote al deslizar— muestra el fondo del documento, que en modo oscuro es negro: se
// veía una franja negra bajo una página clara.
export function pintarFondo(color) {
    const html = document.documentElement;
    const body = document.body;
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const antes = {
        html: html.style.backgroundColor,
        body: body.style.backgroundColor,
        metas: metas.map(m => m.getAttribute("content")),
    };
    html.style.backgroundColor = color;
    body.style.backgroundColor = color;
    metas.forEach(m => m.setAttribute("content", color));
    return () => {
        html.style.backgroundColor = antes.html;
        body.style.backgroundColor = antes.body;
        metas.forEach((m, i) => m.setAttribute("content", antes.metas[i]));
    };
}

// El documento no se desplaza: la página lo hace dentro de su propio contenedor (fixed inset-0
// overflow-y-auto). Devuelve cómo dejarlo como estaba.
//
// Por qué (31-10-2026, medido en el iPhone del usuario con Brave): al deslizar, Brave achica la
// ventana de 770 a 699 px pero el documento conserva los 770, así que CUALQUIER página corta se
// podía correr 71 px y la cabecera quedaba bajo la hora y la batería. Sin desplazamiento del
// documento Brave no tiene qué correr. Se pierde "deslizar para refrescar"; la mesa se refresca
// sola cada 15 s.
export function fijarDocumento() {
    const html = document.documentElement;
    const body = document.body;
    const antes = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
        [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior] = antes;
    };
}
