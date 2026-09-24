// Achica las imágenes antes de subirlas.
//
// En la nube el backend corre en Vercel, que rechaza cualquier petición de más de 4,5 MB con
// un 413 — y sin cabeceras CORS, así que el navegador ni siquiera deja leer ese 413: la app
// solo ve un fallo de red y dice "No se pudo conectar". Un banner exportado desde un programa
// de diseño o una foto de teléfono pasan ese límite con facilidad, y ninguno necesita más de
// ~2400 px de lado para verse nítido en la vitrina.
//
// Solo se tocan las imágenes que lo necesitan (pesadas o enormes); una foto ya liviana se
// sube tal cual, sin recomprimir ni perder calidad. GIF y SVG nunca se tocan: el lienzo
// perdería la animación o convertiría el vector en píxeles.

const LADO_MAX = 2400;
const PESO_OBJETIVO = 1.5 * 1024 * 1024;

const cargar = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen ilegible")); };
    img.src = url;
});

const aBlob = (canvas, type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// ¿Tiene píxeles transparentes? Un PNG con fondo transparente (un logo) no puede pasar a
// JPEG: el fondo se volvería negro.
function tieneTransparencia(ctx, w, h) {
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) return true;
    return false;
}

export async function compressImage(file) {
    if (!(file instanceof File) || !file.type.startsWith("image/")) return file;
    if (/gif|svg/.test(file.type)) return file;

    let img;
    try { img = await cargar(file); } catch { return file; }

    const lado = Math.max(img.naturalWidth, img.naturalHeight);
    if (file.size <= PESO_OBJETIVO && lado <= LADO_MAX) return file;

    const escala = Math.min(1, LADO_MAX / lado);
    const w = Math.round(img.naturalWidth * escala);
    const h = Math.round(img.naturalHeight * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const alfa = file.type !== "image/jpeg" && tieneTransparencia(ctx, w, h);

    // WebP guarda la transparencia y pesa menos; Safari viejo no lo sabe generar y devuelve
    // PNG, así que se verifica el tipo que salió de verdad. Sin transparencia, JPEG va bien
    // en cualquier navegador.
    let blob = null;
    if (alfa) {
        blob = await aBlob(canvas, "image/webp", 0.88);
        if (!blob || blob.type !== "image/webp") blob = await aBlob(canvas, "image/png");
    } else {
        blob = await aBlob(canvas, "image/jpeg", 0.86);
    }

    // Si por lo que sea salió más pesada que la original (una PNG plana ya muy optimizada),
    // se queda la original.
    if (!blob || blob.size >= file.size) return file;

    const ext = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }[blob.type] || "jpg";
    const nombre = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], nombre, { type: blob.type, lastModified: Date.now() });
}

// Rehace un FormData con sus imágenes achicadas. Los campos de texto pasan tal cual.
export async function compressFormData(fd) {
    const out = new FormData();
    for (const [k, v] of fd.entries()) {
        if (v instanceof File) {
            const f = await compressImage(v);
            out.append(k, f, f.name);
        } else {
            out.append(k, v);
        }
    }
    return out;
}
