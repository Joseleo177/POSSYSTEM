import { useState, useEffect } from "react";

// "Un recorrido por el sistema": pestañas con una vista de cada módulo, para que quien no lo
// conoce vea cómo se ve por dentro antes de pedir acceso.
//
// Las vistas están dibujadas, no son capturas: así no se cuela ningún dato real de un cliente
// y se ven nítidas en claro y en oscuro. Los nombres y montos son de ejemplo. Avanza solo cada
// pocos segundos hasta que el visitante toca una pestaña; desde ahí manda él.

const TABS = [
    {
        id: "inventario", titulo: "Inventario por sucursal",
        texto: "Cuánto queda de cada producto en cada tienda, con aviso de lo que está por agotarse y transferencias entre sucursales.",
        icono: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
        id: "cobranza", titulo: "Cuentas por cobrar",
        texto: "Quién te debe, cuánto y desde cuándo. Lo vencido salta a la vista y se cobra desde la misma lista, una o varias facturas a la vez.",
        icono: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
    {
        id: "catalogo", titulo: "Catálogo en línea",
        texto: "Tu tienda publicada con fotos y precios del día. El cliente arma su pedido desde el teléfono y te llega al sistema y por WhatsApp.",
        icono: "M3 9l1.5-5h15L21 9M3 9h18M3 9v10a1 1 0 001 1h5v-6h6v6h5a1 1 0 001-1V9",
    },
    {
        id: "reportes", titulo: "Reportes del día",
        texto: "Ventas, lo cobrado por cada forma de pago y lo que quedó en la calle, sin esperar al cierre de mes.",
        icono: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
];

const ROTAR_MS = 6500;

// Marco de ventana común a todas las vistas.
function Ventana({ titulo, children }) {
    return (
        <div className="rounded-2xl border border-border/70 dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] overflow-hidden">
            <div className="h-10 px-4 flex items-center gap-1.5 border-b border-border/60 dark:border-white/[0.06]">
                <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                <span className="ml-3 text-[12px] text-content-subtle">{titulo}</span>
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </div>
    );
}

function Punto({ tono }) {
    const c = { ok: "bg-content-subtle/40", bajo: "bg-amber-500", agotado: "bg-red-500" }[tono];
    return <span className={`w-1.5 h-1.5 rounded-full inline-block ${c}`} />;
}

function VistaInventario() {
    const filas = [
        ["Harina de maíz 1 kg", "48", "12", "ok"],
        ["Café molido 250 g", "6", "15", "bajo"],
        ["Aceite 1 L", "0", "9", "agotado"],
        ["Queso blanco 1 kg", "14 kg", "3,5 kg", "bajo"],
        ["Refresco 2 L", "60", "36", "ok"],
    ];
    return (
        <Ventana titulo="Inventario · Existencias">
            <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[15px] font-semibold text-content dark:text-white">Existencias</p>
                <span className="text-[12px] text-content-subtle">2 por reponer · 1 agotado</span>
            </div>
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden text-[13px]">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_70px] px-3.5 py-2 bg-surface-2 dark:bg-white/[0.03] text-[12px] text-content-subtle">
                    <span>Producto</span><span className="text-right">Centro</span><span className="text-right">Oeste</span>
                </div>
                {filas.map(([n, a, b, t]) => (
                    <div key={n} className="grid grid-cols-[minmax(0,1fr)_70px_70px] items-center px-3.5 py-2.5 border-t border-border/60 dark:border-white/[0.06]"
                        style={t !== "ok" ? { boxShadow: `inset 3px 0 0 ${t === "agotado" ? "#ef4444" : "#f59e0b"}` } : undefined}>
                        <span className="truncate text-content dark:text-white">{n}</span>
                        <span className={`text-right tabular-nums inline-flex items-center justify-end gap-1.5 ${a === "0" ? "text-red-600 dark:text-red-400 font-medium" : "text-content dark:text-white"}`}>
                            {t !== "ok" && <Punto tono={t} />}{a}
                        </span>
                        <span className="text-right tabular-nums text-content-muted dark:text-white/70">{b}</span>
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 dark:bg-white/[0.03] px-3.5 py-2.5 text-[13px]">
                <span className="text-content-muted dark:text-white/75">Transferencia Oeste → Centro · 9 aceites</span>
                <span className="text-[12px] font-medium text-sky-700 dark:text-sky-400">En camino</span>
            </div>
        </Ventana>
    );
}

function VistaCobranza() {
    const filas = [
        ["Inversiones Rojas C.A.", "A-0081", "Ref. 240.00", "Vencida 12 días", "rojo"],
        ["María González", "A-0088", "Ref. 35.50", "Vence hoy", "ambar"],
        ["Bodega El Sol", "A-0090", "Ref. 112.80", "Vence en 9 días", "gris"],
        ["José Pérez", "A-0092", "Ref. 18.20", "Vence en 14 días", "gris"],
    ];
    const tono = { rojo: "text-red-600 dark:text-red-400 font-medium", ambar: "text-amber-700 dark:text-amber-400 font-medium", gris: "text-content-subtle" };
    return (
        <Ventana titulo="Contabilidad · Cuentas por cobrar">
            <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                    <p className="text-[12px] text-content-subtle">Te deben</p>
                    <p className="text-[24px] font-bold tracking-tight text-content dark:text-white tabular-nums">
                        <span className="text-[0.6em] font-medium text-content-subtle mr-1">Ref.</span>406.50
                    </p>
                </div>
                <span className="text-[12px] font-medium text-red-600 dark:text-red-400">1 vencida · Ref. 240.00</span>
            </div>
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] text-[13px]">
                {filas.map(([c, f, m, v, t]) => (
                    <div key={f} className="px-3.5 py-2.5 flex items-center gap-3"
                        style={t === "rojo" ? { boxShadow: "inset 3px 0 0 #ef4444" } : t === "ambar" ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}>
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-content dark:text-white">{c}</p>
                            <p className="text-[12px] tabular-nums"><span className="text-content-subtle">{f} · </span><span className={tono[t]}>{v}</span></p>
                        </div>
                        <span className="font-semibold tabular-nums text-content dark:text-white">{m}</span>
                        <span className="hidden sm:inline-flex h-8 px-3 rounded-lg border border-border dark:border-white/15 items-center text-[12px] font-medium text-content dark:text-white">Cobrar</span>
                    </div>
                ))}
            </div>
        </Ventana>
    );
}

function VistaCatalogo() {
    const prods = [["Café molido 250 g", "Ref. 3.50"], ["Queso blanco 1 kg", "Ref. 6.80"], ["Harina de maíz 1 kg", "Ref. 1.20"], ["Aceite 1 L", "Ref. 3.90"]];
    return (
        <div className="relative flex justify-center py-2">
            {/* Teléfono del cliente */}
            <div className="w-[260px] rounded-[2rem] border-[6px] border-content/90 dark:border-white/20 bg-white dark:bg-surface-dark-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)] overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-border/60 dark:border-white/[0.06]">
                    <p className="text-[13px] font-bold text-content dark:text-white">Bodega El Sol</p>
                    <p className="text-[11px] text-content-subtle">Pide en línea · retiro o envío</p>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                    {prods.map(([n, p], i) => (
                        <div key={n}>
                            <div className={`aspect-square rounded-xl ${["bg-amber-100", "bg-sky-100", "bg-yellow-100", "bg-emerald-100"][i]} dark:bg-white/[0.06]`} />
                            <p className="mt-1.5 text-[11px] font-medium text-content dark:text-white leading-tight line-clamp-1">{n}</p>
                            <p className="text-[11px] font-semibold tabular-nums text-content dark:text-white">{p}</p>
                        </div>
                    ))}
                </div>
                <div className="mx-3 mb-3 h-10 rounded-full bg-brand-500 text-white text-[12px] font-semibold flex items-center justify-between px-4">
                    <span>Ver pedido · 3</span><span className="tabular-nums">Ref. 13.50</span>
                </div>
            </div>
            {/* Aviso de pedido entrante */}
            <div className="absolute right-0 sm:right-4 top-10 w-[210px] rounded-2xl bg-white dark:bg-surface-dark-2 border border-border/70 dark:border-white/10 shadow-xl p-3">
                <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                    <span className="text-[12px] font-semibold text-content dark:text-white">Pedido nuevo #245</span>
                </div>
                <p className="mt-1.5 text-[12px] text-content-subtle leading-snug">María González · 3 productos · Ref. 13.50. Llegó al sistema y por WhatsApp.</p>
            </div>
        </div>
    );
}

function VistaReportes() {
    const barras = [42, 55, 48, 72, 61, 88, 66];
    const dias = ["L", "M", "M", "J", "V", "S", "D"];
    return (
        <Ventana titulo="Reportes · Hoy">
            <div className="grid grid-cols-3 gap-2.5">
                {[["Vendido", "Ref. 1240.50", ""], ["Cobrado", "Ref. 1105.20", ""], ["En la calle", "Ref. 135.30", "text-amber-700 dark:text-amber-400"]].map(([l, v, c]) => (
                    <div key={l} className="rounded-xl border border-border/70 dark:border-white/[0.08] px-3 py-2.5">
                        <p className="text-[11px] text-content-subtle">{l}</p>
                        <p className={`text-[15px] font-bold tracking-tight tabular-nums ${c || "text-content dark:text-white"}`}>{v}</p>
                    </div>
                ))}
            </div>
            <div className="mt-4">
                <p className="text-[12px] text-content-subtle">Ventas de la semana</p>
                <div className="mt-2 h-28 flex items-end gap-2">
                    {barras.map((h, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className={`w-full rounded-md ${i === 5 ? "bg-brand-500" : "bg-brand-500/25 dark:bg-brand-400/25"}`} style={{ height: `${h}%` }} />
                            <span className="text-[10px] text-content-subtle">{dias[i]}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-4 space-y-1.5 text-[13px]">
                {[["Pago móvil", "#6366f1", "Ref. 512.40"], ["Efectivo $", "#22c55e", "Ref. 388.00"], ["Punto de venta", "#f59e0b", "Ref. 204.80"]].map(([n, c, v]) => (
                    <div key={n} className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-content-muted dark:text-white/75"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />{n}</span>
                        <span className="tabular-nums font-medium text-content dark:text-white">{v}</span>
                    </div>
                ))}
            </div>
        </Ventana>
    );
}

const VISTAS = { inventario: VistaInventario, cobranza: VistaCobranza, catalogo: VistaCatalogo, reportes: VistaReportes };

export default function LandingTour() {
    const [activa, setActiva] = useState(TABS[0].id);
    const [manual, setManual] = useState(false);

    // Avanza solo hasta que el visitante elige una pestaña.
    useEffect(() => {
        if (manual) return;
        const t = setInterval(() => {
            setActiva(a => TABS[(TABS.findIndex(x => x.id === a) + 1) % TABS.length].id);
        }, ROTAR_MS);
        return () => clearInterval(t);
    }, [manual]);

    const Vista = VISTAS[activa];

    return (
        <section id="recorrido" className="scroll-mt-16 border-t border-border/50 dark:border-white/[0.06]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                <div className="max-w-2xl">
                    <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Un recorrido por el sistema</p>
                    <h2 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                        Así se ve por dentro
                    </h2>
                </div>

                <div className="mt-10 grid gap-8 lg:gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center">
                    <div role="tablist" aria-label="Módulos" className="space-y-2">
                        {TABS.map(t => {
                            const on = t.id === activa;
                            return (
                                <button
                                    key={t.id}
                                    role="tab"
                                    aria-selected={on}
                                    onClick={() => { setActiva(t.id); setManual(true); }}
                                    className={`w-full text-left rounded-2xl border p-4 transition-colors flex gap-3.5 ${on
                                        ? "border-brand-500/40 bg-white dark:bg-white/[0.04] shadow-sm"
                                        : "border-transparent hover:bg-white/60 dark:hover:bg-white/[0.03]"}`}
                                >
                                    <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors ${on ? "bg-brand-500 text-white" : "bg-brand-500/10 text-brand-600 dark:text-brand-400"}`}>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={t.icono} /></svg>
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block text-[16px] font-semibold ${on ? "text-content dark:text-white" : "text-content-muted dark:text-white/75"}`}>{t.titulo}</span>
                                        {/* La descripción solo de la activa: las demás quedan como índice. */}
                                        {on && <span className="block mt-1 text-[14px] text-content-muted dark:text-white/65 leading-relaxed">{t.texto}</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div key={activa} className="relative modal-in" aria-hidden="true">
                        <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/15 via-cyan-400/10 to-transparent blur-2xl" />
                        <div className="relative"><Vista /></div>
                    </div>
                </div>
            </div>
        </section>
    );
}
