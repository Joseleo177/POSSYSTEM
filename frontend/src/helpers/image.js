export const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
    const base = import.meta.env.VITE_API_URL || "";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${cleanBase}${cleanUrl}`;
};

// Ícono neutro que ocupa el lugar de una foto que no carga. Sin él el navegador pinta el
// ícono roto y el texto alternativo encima de la tarjeta. Gris a media opacidad para que
// sirva igual en claro y en oscuro (un data URI no hereda currentColor).
export const IMG_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72">'
    + '<g transform="translate(33 21) scale(1.25)" fill="none" stroke="#94a3b8" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>'
    + "</g></svg>"
);

const withBust = (url) => `${url}${url.includes("?") ? "&" : "?"}_r=${Date.now()}`;

// Cuando una <img> falla pone el ícono neutro en su lugar y reintenta en segundo plano con
// backoff (1s, 2s, 4s, 8s): la foto aparece si el servidor se recupera (los 429 de Storage
// son pasajeros) y, si no, queda el ícono; nunca la imagen rota con su texto alternativo.
// Lo llama un listener global (ver main.jsx), así que cubre toda <img> de la app. Con
// data-no-fallback una imagen queda fuera.
export const handleImgError = (img) => {
    if (!img || img.tagName !== "IMG" || img.hasAttribute("data-no-fallback")) return;
    const failed = img.getAttribute("src") || "";
    if (!failed || failed === IMG_PLACEHOLDER) return;

    const base = failed.replace(/[?&]_r=\d+$/, "");
    if (img._imgRetryFor === base) return; // ya la atendió otra llamada (listener + onError)
    img._imgRetryFor = base;
    img.src = IMG_PLACEHOLDER;

    if (base.startsWith("data:") || base.startsWith("blob:")) return;
    // Si React le puso otra foto mientras tanto, el src ya no es el ícono y se abandona.
    const stillWaiting = () => img._imgRetryFor === base && img.getAttribute("src") === IMG_PLACEHOLDER;
    const attempt = (n) => {
        if (n >= 4) return;
        setTimeout(() => {
            if (!stillWaiting()) return;
            const url = withBust(base);
            const probe = new Image();
            probe.onload = () => {
                if (!stillWaiting()) return;
                img._imgRetryFor = null;
                img.src = url;
            };
            probe.onerror = () => attempt(n + 1);
            probe.src = url;
        }, 1000 * Math.pow(2, n));
    };
    attempt(0);
};

// Se conserva por las <img onError={imgRetryOnError}> existentes: el listener global ya hace
// lo mismo y la marca _imgRetryFor evita atender dos veces el mismo error.
export const imgRetryOnError = (e) => handleImgError(e.currentTarget);
