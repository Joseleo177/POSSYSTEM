// Plantilla de la etiqueta de precios.
//
// El diseño es por ZONAS, no por coordenadas libres: cada elemento vive en la zona superior,
// central o inferior, y dentro de la zona ocupa una fila. Así el contenido nunca se sale de la
// etiqueta por más que se cambie el tamaño del rollo, que es el problema de un lienzo libre
// cuando la misma plantilla se imprime en 40×30 y en 80×40.
//
// Se guarda en settings bajo la clave `price_label_template` (JSON), igual que el resto de la
// configuración de impresión.

export const LABEL_ZONES = [
    { id: "top", label: "Superior" },
    { id: "mid", label: "Central" },
    { id: "bottom", label: "Inferior" },
];

export const LABEL_ALIGNS = [
    { value: "left", label: "Izquierda" },
    { value: "center", label: "Centro" },
    { value: "right", label: "Derecha" },
];

// Catálogo de elementos disponibles. `scale` es un factor sobre el tamaño base que se calcula
// a partir del alto de la etiqueta; el precio se auto-escala aparte porque depende de cuántos
// dígitos tenga el número.
export const LABEL_ELEMENTS = [
    { id: "logo",     label: "Logo de la tienda", hint: "El logo cargado en Ajustes" },
    { id: "store",    label: "Nombre de la tienda" },
    { id: "name",     label: "Nombre del producto" },
    { id: "category", label: "Categoría" },
    { id: "price",    label: "Precio", hint: "Se escala solo según los dígitos" },
    { id: "price_alt",label: "Precio en 2ª moneda" },
    { id: "unit",     label: "Unidad de medida" },
    { id: "barcode",  label: "Código de barras" },
    { id: "code",     label: "Código en texto" },
    { id: "date",     label: "Fecha de impresión" },
];

// Diseño de fábrica: el mismo que la etiqueta tenía antes de que esto fuera configurable,
// más el código de barras abajo, apagado por defecto para no cambiarle la etiqueta a nadie.
export const DEFAULT_TEMPLATE = {
    logo:      { on: false, zone: "top",    align: "left",   scale: 1,    inline: false, order: 0 },
    store:     { on: false, zone: "top",    align: "right",  scale: 0.8,  inline: true,  order: 1 },
    name:      { on: true,  zone: "top",    align: "left",   scale: 1,    inline: false, order: 2 },
    category:  { on: false, zone: "top",    align: "left",   scale: 0.75, inline: false, order: 3 },
    price:     { on: true,  zone: "mid",    align: "center", scale: 1,    inline: false, order: 0 },
    price_alt: { on: false, zone: "mid",    align: "center", scale: 0.8,  inline: false, order: 1 },
    unit:      { on: false, zone: "mid",    align: "center", scale: 0.75, inline: true,  order: 2 },
    barcode:   { on: false, zone: "bottom", align: "center", scale: 1,    inline: false, order: 0 },
    code:      { on: false, zone: "bottom", align: "center", scale: 0.75, inline: false, order: 1 },
    date:      { on: false, zone: "bottom", align: "right",  scale: 0.7,  inline: false, order: 2 },
};

export const DEFAULT_LAYOUT = {
    mode: "roll",
    roll: { w: 70, h: 38 },
    border: false,
    altCurrencyId: "",
    template: DEFAULT_TEMPLATE,
};

const ZONE_IDS = LABEL_ZONES.map(z => z.id);
const ALIGN_IDS = LABEL_ALIGNS.map(a => a.value);
const clamp = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Nunca se confía en lo que viene de settings: puede ser de una versión anterior, de otra
// empresa, o quedar a medias si alguien editó el registro a mano.
export const normalizeLayout = (raw) => {
    let parsed = raw;
    if (typeof raw === "string") {
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    if (!parsed || typeof parsed !== "object") return DEFAULT_LAYOUT;

    const template = {};
    for (const el of LABEL_ELEMENTS) {
        const def = DEFAULT_TEMPLATE[el.id];
        const got = parsed.template?.[el.id] || {};
        template[el.id] = {
            on: typeof got.on === "boolean" ? got.on : def.on,
            zone: ZONE_IDS.includes(got.zone) ? got.zone : def.zone,
            align: ALIGN_IDS.includes(got.align) ? got.align : def.align,
            scale: clamp(got.scale, 0.4, 2.5, def.scale),
            inline: typeof got.inline === "boolean" ? got.inline : def.inline,
            order: clamp(got.order, 0, 99, def.order),
        };
    }

    return {
        mode: parsed.mode === "sheet" ? "sheet" : "roll",
        roll: {
            w: clamp(parsed.roll?.w, 15, 82, DEFAULT_LAYOUT.roll.w),
            h: clamp(parsed.roll?.h, 10, 300, DEFAULT_LAYOUT.roll.h),
        },
        border: parsed.border === true,
        // Se guarda como texto porque es lo que devuelve el desplegable; si la moneda dejó de
        // existir, el componente simplemente no encuentra el id y no imprime el segundo precio.
        altCurrencyId: parsed.altCurrencyId != null ? String(parsed.altCurrencyId) : "",
        template,
    };
};

// Elementos activos de una zona, ordenados y agrupados en filas: un elemento marcado `inline`
// comparte fila con el anterior (logo a la izquierda y nombre de tienda a la derecha, por ej.).
export const zoneRows = (template, zone) => {
    const items = LABEL_ELEMENTS
        .map(e => ({ id: e.id, ...template[e.id] }))
        .filter(e => e.on && e.zone === zone)
        .sort((a, b) => a.order - b.order);

    const rows = [];
    for (const item of items) {
        if (item.inline && rows.length > 0) rows[rows.length - 1].push(item);
        else rows.push([item]);
    }
    return rows;
};
