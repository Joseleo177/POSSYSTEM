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

// ── Documentos largos en el teléfono: pestaña aparte ────────────────────────────────
// El catálogo PDF (decenas de páginas con fotos) no salía en el teléfono (11-11-2026): Chrome de
// Android no imprime desde un iframe, y en iOS el camino de la página propia tiene que esperar
// cientos de fotos. En una pantalla táctil el documento se abre en su propia pestaña, con una
// barra que dice cómo guardarlo; desde ahí el diálogo del navegador sí ofrece guardar el PDF.
export const esPantallaTactil = () =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Abre el documento en otra pestaña. Hay que llamarla en el mismo clic del usuario: si no, el
 * navegador la toma por una ventana emergente y la bloquea. Devuelve false si no se pudo abrir.
 * `ancho`: ancho de la hoja en px, para que el teléfono la muestre entera.
 */
export function abrirParaGuardar(html, { ancho = 1123 } = {}) {
    const ios = esWebKitTactil();
    // Ancho de la hoja más un margen, y la escala inicial explícita: sin ella el teléfono abría
    // la lista acercada y la tabla quedaba cortada a la derecha.
    const w = ancho + 40;
    const escala = Math.min(1, (window.screen?.width || 400) / w).toFixed(4);
    // La página se ve alejada para que entre la hoja entera; la barra y la ayuda se agrandan en
    // la misma proporción para leerse a tamaño normal.
    const k = (1 / escala).toFixed(3);
    // Safari del iPhone ignora el tamaño de hoja del documento y abre en vertical: el catálogo
    // apaisado quedaba chiquito arriba de cada hoja. Hay que decirle al usuario que gire la hoja.
    const horizontal = ancho > 1000;
    const girar = horizontal ? " En Orientación elige la hoja <b>horizontal</b>." : "";
    const ayuda = ios
        ? (horizontal
            ? "Toca «Guardar PDF», pon la orientación horizontal y luego Compartir → Guardar en Archivos."
            : "Toca «Guardar PDF» y, en la vista previa, Compartir → Guardar en Archivos.")
        : "Toca «Guardar PDF» y elige «Guardar como PDF» como impresora.";
    // Plan B (11-11-2026): en el iPhone, Brave —y a veces Chrome— ignoran window.print() y el
    // botón no hacía nada. Si en un momento no se abrió la impresión (no llegó `beforeprint`),
    // se muestran los pasos por el menú Compartir del navegador, que sí imprime en todos.
    // Con la app instalada en la pantalla de inicio, el iPhone abre la pestaña en un visor propio
    // que no imprime (probado 11-11-2026). Ahí no sirven los pasos: hay que ir a Safari.
    const appInstalada = ios && window.navigator.standalone === true;
    const pasos = appInstalada
        ? `<li>Cierra esto con la <b>X</b> de arriba.</li>
           <li>Abre <b>Safari</b> y entra a la app desde ahí, no desde su ícono.</li>
           <li>Genera el PDF de nuevo: en Safari el botón «Guardar PDF» sí funciona.</li>`
        : ios
        ? `<li>Toca <b>Compartir</b> (el cuadro con la flecha hacia arriba). En Brave está en el menú <b>···</b>.</li>
           <li>Elige <b>Imprimir</b>.</li>
           <li>${girar} En la vista previa toca <b>Compartir</b> otra vez y luego <b>Guardar en Archivos</b>.</li>`
        : `<li>Abre el menú del navegador (<b>⋮</b>) y toca <b>Compartir</b> → <b>Imprimir</b>.</li>
           <li>Como impresora elige <b>Guardar como PDF</b> y toca descargar.</li>`;
    const barra = `
<style>
  @media screen {
    /* Chrome del teléfono agranda el texto de las páginas anchas por su cuenta y la tabla se
       salía de la pantalla. La lista, además, no tiene hojas de ancho fijo: se le da el suyo. */
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { padding-top: calc(64px * ${k}) !important; }
    html:not(:has(section.pg)) body { max-width: ${ancho}px; margin: 0 auto !important; padding-left: 14px !important; padding-right: 14px !important; }
    html:has(section.pg) body { background: #e9e9ee !important; }
    .barra-guardar, .ayuda-guardar { zoom: ${k}; font-family: -apple-system, 'Segoe UI', sans-serif; }
    .barra-guardar { position: fixed; top: 0; left: 0; right: 0; z-index: 99; display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.15); font-size: 15px; line-height: 1.3; color: #333; }
    .barra-guardar span { flex: 1; min-width: 0; font-size: 13px; color: #666; }
    .barra-guardar button { flex: none; height: 44px; padding: 0 20px; border: 0; border-radius: 10px; background: #111; color: #fff; font: 600 15px -apple-system, 'Segoe UI', sans-serif; }
    .ayuda-guardar { display: none; position: fixed; top: 72px; left: 10px; right: 10px; z-index: 100; background: #fff; border-radius: 14px;
      box-shadow: 0 8px 30px rgba(0,0,0,.25); padding: 16px 18px; font-size: 15px; line-height: 1.45; color: #222; }
    .ayuda-guardar p { margin: 0 0 8px; font-weight: 600; }
    .ayuda-guardar ol { margin: 0 0 12px; padding-left: 20px; }
    .ayuda-guardar li { margin-bottom: 6px; }
    .ayuda-guardar button { height: 40px; padding: 0 16px; border: 1px solid #ccc; border-radius: 10px; background: #fff; font: 600 14px -apple-system, 'Segoe UI', sans-serif; color: #222; }
    section.pg { margin: 0 auto 14px; box-shadow: 0 2px 10px rgba(0,0,0,.12); }
  }
  @media print { .barra-guardar, .ayuda-guardar { display: none !important; } }
</style>
<div class="barra-guardar"><span>${ayuda}</span><button type="button" onclick="guardarPdf()">Guardar PDF</button></div>
<div class="ayuda-guardar" id="ayuda-guardar">
  <p>${appInstalada ? "Desde la app instalada el iPhone no deja guardar el PDF." : "Este navegador no abrió la impresión. Hazlo desde su menú:"}</p>
  <ol>${pasos}</ol>
  <button type="button" onclick="document.getElementById('ayuda-guardar').style.display='none'">Entendido</button>
</div>
<script>
  (function () {
    var abierto = false;
    window.addEventListener("beforeprint", function () { abierto = true; });
    window.guardarPdf = function () {
      abierto = false;
      try { window.print(); } catch (e) {}
      setTimeout(function () { if (!abierto) document.getElementById("ayuda-guardar").style.display = "block"; }, 1500);
    };
  })();
</script>`;
    const doc = html
        .replace(/<head>/i, `<head><meta name="viewport" content="width=${w}, initial-scale=${escala}">`)
        .replace(/<body([^>]*)>/i, `<body$1>${barra}`);
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    const win = window.open(url, "_blank");
    // Se libera tarde: si el usuario recarga la pestaña, la dirección tiene que seguir viva.
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    return !!win;
}
