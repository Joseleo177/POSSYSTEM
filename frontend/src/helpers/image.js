export const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
    const base = import.meta.env.VITE_API_URL || "";
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `${cleanBase}${cleanUrl}`;
};
