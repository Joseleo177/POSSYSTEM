// src/layout/AppLauncher.jsx
import React, { useEffect, useRef, useState } from "react";
import { TAB_ICONS } from "../constants/icons";

// Lanzador de aplicaciones.
//
// Antes cada app era un bloque con degradado de su color y el texto en blanco: doce colores
// saturados a la vez competían entre sí y ninguno destacaba. Ahora el color de cada app vive
// solo en su icono (sigue sirviendo para reconocerla de un vistazo) y la tarjeta es neutra,
// con el nombre y una línea que dice para qué sirve. Las apps van agrupadas por el trabajo
// que resuelven, y se puede escribir para abrir una sin buscarla con el ratón.

// Clases completas y fijas: Tailwind solo genera las que ve escritas.
const APPS = {
    Cobro:           { tone: "bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400", hint: "Vender y cobrar" },
    "Catálogo":      { tone: "bg-violet-500/[0.12] text-violet-600 dark:text-violet-400",    hint: "Productos y precios" },
    Inventario:      { tone: "bg-amber-500/[0.12] text-amber-600 dark:text-amber-400",       hint: "Stock y transferencias" },
    Compras:         { tone: "bg-orange-500/[0.12] text-orange-600 dark:text-orange-400",    hint: "Mercancía de proveedores" },
    Clientes:        { tone: "bg-sky-500/[0.12] text-sky-600 dark:text-sky-400",             hint: "Clientes y proveedores" },
    Dashboard:       { tone: "bg-cyan-500/[0.12] text-cyan-600 dark:text-cyan-400",          hint: "Resumen del negocio" },
    Contabilidad:    { tone: "bg-green-500/[0.12] text-green-600 dark:text-green-400",       hint: "Cajas, facturas y cuentas" },
    Reportes:        { tone: "bg-indigo-500/[0.12] text-indigo-600 dark:text-indigo-400",    hint: "Ventas, márgenes y más" },
    Monedas:         { tone: "bg-blue-500/[0.12] text-blue-600 dark:text-blue-400",          hint: "Tasa del día" },
    Empleados:       { tone: "bg-pink-500/[0.12] text-pink-600 dark:text-pink-400",          hint: "Usuarios y permisos" },
    Empresas:        { tone: "bg-rose-500/[0.12] text-rose-600 dark:text-rose-400",          hint: "Empresas del sistema" },
    "Configuración": { tone: "bg-slate-500/[0.12] text-slate-600 dark:text-slate-300",       hint: "Datos de la empresa" },
};

const SECCIONES = [
    { label: "Operación",      keys: ["Cobro", "Catálogo", "Inventario", "Compras", "Clientes"] },
    { label: "Finanzas",       keys: ["Dashboard", "Contabilidad", "Reportes", "Monedas"] },
    { label: "Administración", keys: ["Empleados", "Empresas", "Configuración"] },
];

const sinAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Solo con teclado físico se enfoca el buscador: en un teléfono o una tablet abriría el
// teclado en pantalla sin que nadie lo pidiera (ver ui/Modal).
const conTecladoFisico = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export default function AppLauncher({ open, onClose, visibleTabs, safeTab, goTab }) {
    const [q, setQ] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setQ("");
        const handleKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handleKey);
        const frame = requestAnimationFrame(() => { if (conTecladoFisico()) inputRef.current?.focus(); });
        return () => { window.removeEventListener("keydown", handleKey); cancelAnimationFrame(frame); };
    }, [open, onClose]);

    if (!open) return null;

    const abrir = (key) => { goTab(key); onClose(); };

    const filtro = sinAcentos(q.trim());
    const coincide = (t) => !filtro
        || sinAcentos(t.label).includes(filtro)
        || sinAcentos(APPS[t.key]?.hint || "").includes(filtro);
    const visibles = visibleTabs.filter(coincide);

    // Secciones con lo que el usuario puede ver; una app que no esté en ninguna (nueva, sin
    // clasificar) cae en "Otras" en vez de desaparecer.
    const porKey = new Map(visibles.map(t => [t.key, t]));
    const clasificadas = new Set(SECCIONES.flatMap(s => s.keys));
    const grupos = [
        ...SECCIONES.map(s => ({ label: s.label, tabs: s.keys.map(k => porKey.get(k)).filter(Boolean) })),
        { label: "Otras", tabs: visibles.filter(t => !clasificadas.has(t.key)) },
    ].filter(g => g.tabs.length > 0);

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[900] flex items-start justify-center bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in p-4 pt-[10vh] overflow-y-auto"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] shadow-[0_24px_64px_-12px_rgb(0_0_0/0.3)] modal-in overflow-hidden"
            >
                {/* Buscador */}
                <div className="flex items-center gap-3 px-5 h-14 border-b border-border/70 dark:border-white/[0.06]">
                    <svg className="w-4 h-4 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && visibles[0]) abrir(visibles[0].key); }}
                        placeholder="Ir a una aplicación…"
                        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-content dark:text-white placeholder:text-content-subtle"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button onClick={onClose} className="row-icon shrink-0" title="Cerrar (Esc)" aria-label="Cerrar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-3 sm:p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {grupos.length === 0 && (
                        <p className="py-10 text-center text-[13px] text-content-subtle">Ninguna aplicación coincide con «{q}»</p>
                    )}
                    {grupos.map(g => (
                        <section key={g.label}>
                            <h3 className="px-2 mb-1.5 text-[12px] font-medium text-content-subtle">{g.label}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                                {g.tabs.map(t => {
                                    const app = APPS[t.key] || { tone: "bg-surface-3 text-content-muted", hint: "" };
                                    const actual = safeTab === t.key;
                                    const primera = filtro && visibles[0]?.key === t.key;
                                    return (
                                        <button
                                            key={t.key}
                                            onClick={() => abrir(t.key)}
                                            className={`group flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors active:scale-[0.99] ${
                                                actual || primera
                                                    ? "bg-brand-500/[0.07] ring-1 ring-inset ring-brand-500/30"
                                                    : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"
                                            }`}
                                        >
                                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${app.tone}`}>
                                                {TAB_ICONS[t.key]?.("w-5 h-5")}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="text-[14px] font-semibold text-content dark:text-white truncate">{t.label}</span>
                                                    {actual && <span className="text-[11px] font-medium text-brand-700 dark:text-brand-300 shrink-0">Actual</span>}
                                                </span>
                                                {app.hint && <span className="block text-[12px] text-content-subtle truncate">{app.hint}</span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
