// Estado de la licencia de una empresa, tal como se lee en la pantalla de Empresas.
//
// La columna `subscription_status` es lo que el superusuario eligió, pero lo que hay que ver
// es lo que ESTÁ pasando: una "Activa" cuya fecha ya pasó está vencida, y una que vence en
// tres días pide atención aunque diga "Activa". El color sigue la guía: lo normal en gris con
// su visto; ámbar lo que vence pronto; rojo lo vencido. Suspender es una decisión, no una
// alarma: va en gris tachado.
export const LICENSE_STATUS = {
    activa:     { label: "Activa",     tone: "success", quiet: "check" },
    demo:       { label: "Demo",       tone: "info" },
    por_vencer: { label: "Por vencer", tone: "warning", flag: true },
    vencida:    { label: "Vencida",    tone: "danger",  flag: true },
    suspendida: { label: "Suspendida", tone: "neutral", quiet: "void" },
};

// Días hasta el vencimiento, contados en fechas (no en horas). null = sin vencimiento.
export function diasParaVencer(expiresAt) {
    if (!expiresAt) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const exp = new Date(expiresAt); exp.setHours(0, 0, 0, 0);
    return Math.round((exp - hoy) / 86_400_000);
}

export function estadoLicencia(c) {
    const dias = diasParaVencer(c.expires_at);
    if (c.subscription_status === "Suspendida") return "suspendida";
    if (c.subscription_status === "Vencida" || (dias !== null && dias < 0)) return "vencida";
    if (dias !== null && dias <= 7) return "por_vencer";
    if (c.subscription_status === "Demo") return "demo";
    return "activa";
}

export const fmtFecha = (d) => d
    ? new Date(d).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" })
    : null;

// "Vence hoy", "En 5 días", "Hace 3 días". `tone` dice si pide atención.
export function vencimientoRelativo(expiresAt) {
    const dias = diasParaVencer(expiresAt);
    if (dias === null) return { text: "Sin vencimiento", tone: null };
    if (dias < 0) return { text: `Venció hace ${-dias} ${dias === -1 ? "día" : "días"}`, tone: "danger" };
    if (dias === 0) return { text: "Vence hoy", tone: "warning" };
    if (dias <= 7) return { text: `En ${dias} ${dias === 1 ? "día" : "días"}`, tone: "warning" };
    return { text: `En ${dias} días`, tone: null };
}

export const TONO_TEXTO = {
    danger:  "text-red-600 dark:text-red-400",
    warning: "text-amber-700 dark:text-amber-400",
};

export const usuariosTexto = (max) => (Number(max) === 0 ? "Usuarios sin límite" : `Hasta ${max ?? 5} usuarios`);
