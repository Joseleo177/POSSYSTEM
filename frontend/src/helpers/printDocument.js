// Único camino para mandar un documento HTML a la impresora del navegador.
//
// Hasta ahora cada helper montaba su propio iframe oculto y llamaba a
// iframe.contentWindow.print(). En escritorio funciona, pero el WebKit del iPhone y del iPad
// —y en iOS todos los navegadores son WebKit, también Chrome— ignora el iframe y manda a
// imprimir SIEMPRE el documento de nivel superior: el cajero pedía la factura en PDF y en la
// hoja le salía la pantalla del POS. No hay forma de imprimir un iframe en iOS, así que allí
// se hace al revés: el documento se monta en la propia página y se oculta todo lo demás, que
// es justo lo que WebKit insiste en imprimir.
//
// El HTML entra igual en los dos caminos: un documento completo, con su <style> y su @page.

const PRINT_ROOT = "data-print-doc";

// iPadOS se presenta como "Macintosh" desde iOS 13; el táctil es lo que lo delata.
const esWebKitTactil = () => {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
};

// Espera a que estén la tipografía y las imágenes: sin esto el diálogo se abre con el layout
// a medio armar y el PDF sale con la fuente de respaldo y el hueco del logo en blanco. El
// tope existe porque una imagen rota no puede dejar al cajero sin imprimir.
function esperarRecursos(raiz, doc, tope = 2500) {
    const imgs = Array.from(raiz.querySelectorAll("img"))
        .filter(img => !img.complete)
        .map(img => new Promise(ok => { img.onload = img.onerror = ok; }));
    const listo = Promise.all([doc.fonts ? doc.fonts.ready : Promise.resolve(), ...imgs]);
    return Promise.race([listo, new Promise(ok => setTimeout(ok, tope))]);
}

// ── Camino de escritorio: iframe oculto ──────────────────────────────────────────────
// Sin pestaña nueva y sin bloqueadores de popup, que en una caja son la norma.
function imprimirEnIframe(html, { width, height }) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${width}px;height:${height}px;border:0;`;

    // Una sola limpieza y sin dar por hecho que el iframe sigue colgando del body: el
    // removeChild pelado reventaba con NotFoundError si ya se había ido.
    let limpio = false;
    const limpiar = () => {
        if (limpio) return;
        limpio = true;
        iframe.remove();
        // Devolver el foco a la ventana principal NO es opcional: para imprimir hay que
        // enfocar el iframe, y mientras el foco vive ahí dentro el teclado se lo entrega a él.
        // Los atajos del POS cuelgan de un keydown sobre `window`, así que con el foco
        // atrapado en el iframe dejaban de responder Enter, Esc y los dígitos hasta recargar.
        try { window.focus(); } catch { /* sin foco disponible no hay nada que recuperar */ }
    };

    // El handler se asigna ANTES de montar el iframe: al revés, el load ya se había disparado
    // cuando se asignaba `onload` y el iframe quedaba pegado al DOM sin imprimir nada.
    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            // Cerrar el diálogo devuelve el control aquí. Un timeout fijo borraba el iframe
            // mientras el cajero todavía tenía la vista previa abierta y salía en blanco.
            iframe.contentWindow.onafterprint = limpiar;
            iframe.contentWindow.print();
        } catch {
            limpiar();
        }
    };

    // srcdoc en vez de document.write: así el load llega recién cuando el documento terminó
    // de cargar sus recursos.
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    // Red de seguridad, FUERA del onload a propósito: el caso que deja el POS trabado es
    // justamente aquel en que el handler no llega a ejecutarse.
    setTimeout(limpiar, 60000);
}

// ── Camino iOS: el documento se monta en la página ───────────────────────────────────
function imprimirEnLaPagina(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    let css = Array.from(doc.querySelectorAll("style")).map(n => n.textContent).join("\n");
    // Los comentarios se van primero, y no por limpieza: las maquetas explican en prosa por qué
    // usan @page, y al buscar la regla el buscador arrancaba dentro del comentario y se comía
    // todo hasta la primera llave, que era la de body.
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    // @page no tiene ningún efecto dentro de un shadow root: el tamaño de hoja y los márgenes
    // se los tiene que tragar el documento de verdad.
    const reglasPagina = (css.match(/@page[^{]*\{[^}]*\}/g) || []).join("\n");
    css = css.replace(/@page[^{]*\{[^}]*\}/g, "");
    // Dentro del shadow no hay <body>, así que sus reglas —tipografía, ancho de hoja,
    // padding— pasan al host, que es quien hace de hoja.
    css = css.replace(/(^|[\s,{}])(?:html\s*,\s*body|html|body)(?![\w-])/g, "$1:host");
    // Las maquetas piden la tipografía con @import, y dentro de un shadow root WebKit no lo
    // resuelve: el documento salía con la fuente de respaldo. Las @font-face declaradas a
    // nivel de documento sí valen dentro del shadow, así que el @import se vuelve un <link>.
    const fuentes = Array.from(css.matchAll(/@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)\s*;?/g)).map(m => m[1]);
    css = css.replace(/@import[^;]+;/g, "");
    Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).forEach(l => fuentes.push(l.href || l.getAttribute("href")));

    // Shadow root para que el CSS del POS (Tailwind, tema oscuro, tipografías) no se filtre
    // al documento: la factura tiene que salir igual que en escritorio.
    const host = document.createElement("div");
    host.setAttribute(PRINT_ROOT, "");
    host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{all:initial;display:block;background:#fff;color:#000;}</style><style>${css}</style>${doc.body.innerHTML}`;

    const links = fuentes.filter(Boolean).map(href => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(PRINT_ROOT, "");
        return link;
    });

    const estilos = document.createElement("style");
    estilos.setAttribute(PRINT_ROOT, "");
    estilos.textContent = `
        ${reglasPagina}
        @media print {
            html, body { height:auto !important; overflow:visible !important; background:#fff !important; margin:0 !important; padding:0 !important; }
            /* Los modales del POS cuelgan de <body> por portal, así que se ocultan solos. */
            body > *:not([${PRINT_ROOT}]) { display:none !important; }
            [${PRINT_ROOT}] { position:static !important; left:auto !important; top:auto !important; z-index:auto !important; display:block !important; }
        }`;

    links.forEach(l => document.head.appendChild(l));
    document.head.appendChild(estilos);
    document.body.appendChild(host);

    let limpio = false;
    const limpiar = () => {
        if (limpio) return;
        limpio = true;
        window.removeEventListener("afterprint", limpiar);
        host.remove();
        estilos.remove();
        links.forEach(l => l.remove());
    };

    esperarRecursos(shadow, document).then(() => {
        window.addEventListener("afterprint", limpiar);
        try { window.print(); } catch { limpiar(); }
        // iOS no siempre dispara afterprint. Se limpia tarde a propósito: quitarlo antes de
        // tiempo deja la hoja en blanco si el usuario cambia una opción del diálogo y WebKit
        // vuelve a dibujar la vista previa.
        setTimeout(limpiar, 60000);
    });
}

/**
 * Imprime un documento HTML completo. `width` y `height` son solo el lienzo del iframe de
 * escritorio, donde el layout se calcula antes de abrir el diálogo: 816x1056 es la hoja carta
 * a 96dpi y 300 o 400 de ancho, el rollo térmico.
 */
export function printHtml(html, { width = 816, height = 1056 } = {}) {
    if (esWebKitTactil()) imprimirEnLaPagina(html);
    else imprimirEnIframe(html, { width, height });
}
