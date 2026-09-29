// Etiqueta del rol junto al nombre del empleado (barra superior, menú lateral).
// Tintes suaves sin borde y con el texto un tono más oscuro que el velo, para que se lean.
// Antes el administrador iba en rojo de peligro, y se leía como una alerta permanente en la
// esquina de la pantalla; ahora lleva el color de marca.
export const ROLE_COLORS = {
    admin:     "text-brand-700 bg-brand-500/10 border-transparent dark:text-brand-300",
    manager:   "text-violet-700 bg-violet-500/10 border-transparent dark:text-violet-300",
    cashier:   "text-emerald-700 bg-emerald-500/10 border-transparent dark:text-emerald-300",
    warehouse: "text-sky-700 bg-sky-500/10 border-transparent dark:text-sky-300",
};

export const DEFAULT_ROLE_CLASS =
    "text-content-muted border-transparent bg-surface-3 dark:bg-white/[0.06]";
