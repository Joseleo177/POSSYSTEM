export const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
    const base = import.meta.env.VITE_API_URL || "";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${cleanBase}${cleanUrl}`;
};

// Reintenta cargar la imagen con backoff exponencial (1s, 2s, 4s, 8s) hasta 4 veces.
// Uso: <img onError={imgRetryOnError} ... />
export const imgRetryOnError = (e) => {
    const img = e.currentTarget;
    const retries = parseInt(img.dataset.retries || "0");
    if (retries < 4) {
        img.dataset.retries = retries + 1;
        const delay = 1000 * Math.pow(2, retries); // 1s, 2s, 4s, 8s
        setTimeout(() => {
            const base = img.dataset.origSrc || img.src.split("?")[0];
            img.dataset.origSrc = base;
            img.src = `${base}?_r=${Date.now()}`;
        }, delay);
    } else {
        img.style.display = "none";
    }
};
