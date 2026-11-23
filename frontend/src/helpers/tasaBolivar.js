// De dónde sale la tasa del bolívar de cada empresa (setting `bolivar_rate_source`).
//
// La base es el dólar —así se trabaja en Venezuela— y lo que cambia de una tienda a otra es a
// qué tasa pasa ese dólar a bolívares. Sin la clave, dólar BCV, como todas las de antes.
// Espejo de FUENTES_BOLIVAR en backend/src/controllers/currencies.js.

export const FUENTES_BOLIVAR = [
    { value: "bcv_usd",  label: "Dólar BCV",      hint: "La tasa oficial del dólar. El aviso la ofrece cuando el BCV publica una nueva." },
    { value: "bcv_eur",  label: "Euro BCV",       hint: "Tus precios en $ se pasan a Bs con la tasa oficial del euro. El aviso la ofrece cuando el BCV la publica." },
    { value: "paralelo", label: "USDT / Paralelo", hint: "Referencia del mercado (dolarapi). El aviso te la ofrece; si tu USDT es otra, ponla a mano y no se pisa." },
    { value: "manual",   label: "A mano",         hint: "La pones tú cada día. Ni el aviso ni \"Sincronizar tasas\" la cambian." },
];

const VALIDAS = new Set(FUENTES_BOLIVAR.map(f => f.value));

// Sin la clave (empresas de antes): dólar BCV, salvo que ya hubieran apagado el "Sincronizar"
// del bolívar, que era la forma de decir "la tasa la pongo yo". Espejo de fuenteDelBolivar.
export const fuenteBolivar = (settings, currencies = []) => {
    if (VALIDAS.has(settings?.bolivar_rate_source)) return settings.bolivar_rate_source;
    const ves = currencies.find(c => c.code === "VES" && !c.is_base && !c.rate_of_id);
    return ves && ves.auto_sync === false ? "manual" : "bcv_usd";
};

// Nombre corto para el aviso y la barra: "Tasa BCV del euro", "El paralelo"...
export const NOMBRE_TASA = {
    bcv_usd: "Tasa BCV",
    bcv_eur: "Tasa BCV del euro",
    paralelo: "Dólar paralelo",
};

// Lo que queda en el historial de tasas al aplicarla desde el aviso.
export const ORIGEN_FUENTE = { bcv_usd: "bcv", bcv_eur: "bcv-euro", paralelo: "paralelo" };
