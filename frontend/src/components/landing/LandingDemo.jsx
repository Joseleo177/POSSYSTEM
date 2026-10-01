import { useState } from "react";

// "Pruébalo tú mismo": una caja de juguete en la portada. El visitante toca productos, elige
// cómo paga y cobra, y ve la venta registrada — lo mismo que hace un cajero, en tres pasos.
//
// Es SOLO del navegador: no llama al servidor ni crea nada. Los productos, la tasa y el número
// de factura son de ejemplo. Lo que sí es fiel al sistema es la forma: precio en referencia,
// cobro en bolívares a la tasa del día y el vuelto en la moneda que entra.

const TASA = 857.8876;
const PRODUCTOS = [
    { id: 1, nombre: "Harina de maíz 1 kg", precio: 1.2 },
    { id: 2, nombre: "Café molido 250 g",   precio: 3.5 },
    { id: 3, nombre: "Refresco 2 L",        precio: 2.1 },
    { id: 4, nombre: "Queso blanco 1 kg",   precio: 6.8 },
    { id: 5, nombre: "Pan campesino",       precio: 1.5 },
    { id: 6, nombre: "Aceite 1 L",          precio: 3.9 },
];
const METODOS = [
    { id: "efectivo", nombre: "Efectivo $",     color: "#22c55e", moneda: "Ref." },
    { id: "pagomovil", nombre: "Pago móvil",    color: "#6366f1", moneda: "Bs." },
    { id: "punto",    nombre: "Punto de venta", color: "#f59e0b", moneda: "Bs." },
];

const r2 = (n) => Math.round(n * 100) / 100;
const ref = (n) => `Ref. ${n.toFixed(2)}`;
const bs = (n) => `Bs. ${r2(n * TASA).toFixed(2)}`;

const CHECK = "M5 13l4 4L19 7";

function Paso({ n, titulo, texto, estado }) {
    // estado: "hecho" | "actual" | "pendiente"
    return (
        <li className="flex gap-3.5">
            <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[14px] font-semibold transition-colors ${
                estado === "hecho" ? "bg-emerald-500 text-white"
                    : estado === "actual" ? "bg-brand-500 text-white ring-4 ring-brand-500/20"
                    : "bg-surface-3 dark:bg-white/[0.08] text-content-subtle"}`}>
                {estado === "hecho"
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={CHECK} /></svg>
                    : n}
            </span>
            <div className="pt-1">
                <p className={`text-[15px] font-semibold ${estado === "pendiente" ? "text-content-subtle" : "text-content dark:text-white"}`}>{titulo}</p>
                <p className="text-[14px] text-content-subtle leading-relaxed">{texto}</p>
            </div>
        </li>
    );
}

export default function LandingDemo() {
    const [carrito, setCarrito] = useState({});     // id → cantidad
    const [cobrando, setCobrando] = useState(false); // eligiendo forma de pago
    const [metodo, setMetodo] = useState(null);      // venta cerrada con este método

    const lineas = PRODUCTOS.filter(p => carrito[p.id]).map(p => ({ ...p, cant: carrito[p.id] }));
    const total = r2(lineas.reduce((a, l) => a + l.precio * l.cant, 0));
    const unidades = lineas.reduce((a, l) => a + l.cant, 0);

    const agregar = (id) => { if (!metodo) setCarrito(c => ({ ...c, [id]: (c[id] || 0) + 1 })); };
    const quitar = (id) => setCarrito(c => {
        const n = { ...c };
        if (n[id] > 1) n[id] -= 1; else delete n[id];
        return n;
    });
    const reiniciar = () => { setCarrito({}); setCobrando(false); setMetodo(null); };

    // Cada paso está hecho, en curso o por venir, según hasta dónde llegó la venta.
    const avance = metodo ? 3 : cobrando ? 2 : unidades > 0 ? 1 : 0; // pasos ya completados
    const estado = (n) => n <= avance ? "hecho" : n === avance + 1 ? "actual" : "pendiente";

    return (
        <section id="demo" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
            <div className="relative rounded-[28px] p-[1px] bg-gradient-to-br from-brand-500/40 via-border/40 to-cyan-400/30 dark:via-white/10">
                <div className="relative overflow-hidden rounded-[27px] bg-white dark:bg-surface-dark-2 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-12 p-6 sm:p-10">
                    <div aria-hidden="true" className="absolute -bottom-32 -left-24 w-[420px] h-[420px] rounded-full bg-brand-500/10 blur-[100px] pointer-events-none" />

                    {/* Explicación y pasos */}
                    <div className="relative">
                        <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Pruébalo tú mismo</p>
                        <h2 className="mt-2 text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                            Cobra una venta en tres toques
                        </h2>
                        <p className="mt-3 text-[16px] text-content-muted dark:text-white/70 leading-relaxed">
                            Así trabaja un cajero con Nexus. Toca los productos de la derecha y termina la venta.
                        </p>

                        <ol className="mt-8 space-y-5">
                            <Paso n={1} titulo="Agrega productos" texto="Cada toque suma uno. El total sale en referencia y en bolívares." estado={estado(1)} />
                            <Paso n={2} titulo="Toca Cobrar" texto="Con el carrito listo, el cajero pasa al pago." estado={estado(2)} />
                            <Paso n={3} titulo="Elige cómo paga" texto="Efectivo, pago móvil o punto. El monto se convierte solo a la tasa del día." estado={estado(3)} />
                        </ol>

                        {(unidades > 0 || metodo) && (
                            <button onClick={reiniciar}
                                className="mt-8 h-10 px-4 rounded-full border border-border dark:border-white/15 text-[14px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors">
                                Empezar de nuevo
                            </button>
                        )}
                        <p className="mt-6 text-[12px] text-content-subtle">Demostración con datos de ejemplo. No se registra nada.</p>
                    </div>

                    {/* La caja */}
                    <div className="relative rounded-2xl border border-border/70 dark:border-white/10 bg-surface-2/60 dark:bg-black/20 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.4)] overflow-hidden">
                        <div className="h-10 px-4 flex items-center gap-1.5 border-b border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]">
                            <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                            <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                            <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                            <span className="ml-3 text-[12px] text-content-subtle">Caja · Sucursal Centro</span>
                            <span className="ml-auto text-[12px] text-content-subtle tabular-nums">Tasa {TASA.toFixed(4)}</span>
                        </div>

                        {metodo ? (
                            // Venta registrada
                            <div className="p-6 sm:p-8 min-h-[360px] flex flex-col items-center justify-center text-center">
                                <span className="w-14 h-14 rounded-full bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d={CHECK} /></svg>
                                </span>
                                <p className="mt-4 text-[13px] text-content-subtle">Venta registrada</p>
                                <p className="text-[18px] font-semibold text-content dark:text-white">Factura A-0094 · Pagada</p>
                                <div className="mt-5 w-full max-w-xs rounded-xl bg-white dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] px-4 py-3 text-left space-y-1.5 text-[13px]">
                                    <div className="flex justify-between"><span className="text-content-subtle">{unidades} {unidades === 1 ? "producto" : "productos"}</span><span className="tabular-nums text-content dark:text-white">{ref(total)}</span></div>
                                    <div className="flex justify-between"><span className="text-content-subtle">Cobrado con</span>
                                        <span className="inline-flex items-center gap-1.5 text-content dark:text-white">
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: metodo.color }} />{metodo.nombre}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pt-1.5 border-t border-border/60 dark:border-white/[0.06]">
                                        <span className="text-content-subtle">Entró a caja</span>
                                        <span className="font-semibold tabular-nums text-content dark:text-white">{metodo.moneda === "Bs." ? bs(total) : ref(total)}</span>
                                    </div>
                                </div>
                                <button onClick={reiniciar} className="mt-6 btn-accent h-11 px-5 rounded-full text-[14px] font-semibold">Nueva venta</button>
                            </div>
                        ) : (
                            <div className="grid sm:grid-cols-[minmax(0,1fr)_220px] min-h-[360px]">
                                {/* Productos */}
                                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
                                    {PRODUCTOS.map(p => (
                                        <button key={p.id} onClick={() => agregar(p.id)} disabled={cobrando}
                                            className={`relative text-left rounded-xl border p-3 transition-all active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${
                                                carrito[p.id] ? "border-brand-500/60 bg-brand-500/[0.06]" : "border-border/70 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-content-subtle/50"}`}>
                                            {carrito[p.id] && (
                                                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1 rounded-full bg-brand-500 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">{carrito[p.id]}</span>
                                            )}
                                            <span className="block text-[13px] font-medium text-content dark:text-white leading-snug pr-5">{p.nombre}</span>
                                            <span className="block mt-1.5 text-[13px] font-semibold text-content dark:text-white tabular-nums">{ref(p.precio)}</span>
                                            <span className="block text-[11px] text-content-subtle tabular-nums">{bs(p.precio)}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Carrito / pago */}
                                <div className="border-t sm:border-t-0 sm:border-l border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-3 flex flex-col">
                                    {!cobrando ? (
                                        <>
                                            <p className="text-[12px] font-medium text-content-subtle px-1">Carrito</p>
                                            <div className="mt-1.5 flex-1 space-y-1 overflow-y-auto max-h-[200px]">
                                                {lineas.length === 0 ? (
                                                    <p className="px-1 py-6 text-center text-[12px] text-content-subtle">Toca un producto para agregarlo</p>
                                                ) : lineas.map(l => (
                                                    <div key={l.id} className="flex items-center gap-2 px-1 py-1 text-[12px]">
                                                        <button onClick={() => quitar(l.id)} aria-label={`Quitar ${l.nombre}`}
                                                            className="w-5 h-5 shrink-0 rounded-md border border-border dark:border-white/15 text-content-subtle hover:text-content dark:hover:text-white flex items-center justify-center">−</button>
                                                        <span className="flex-1 min-w-0 truncate text-content dark:text-white">{l.cant} × {l.nombre}</span>
                                                        <span className="tabular-nums text-content dark:text-white">{(l.precio * l.cant).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-border/60 dark:border-white/[0.06] px-1">
                                                <div className="flex items-baseline justify-between">
                                                    <span className="text-[12px] text-content-subtle">Total</span>
                                                    <span className="text-[18px] font-bold tracking-tight tabular-nums text-content dark:text-white">{ref(total)}</span>
                                                </div>
                                                <p className="text-right text-[11px] text-content-subtle tabular-nums">{bs(total)}</p>
                                            </div>
                                            <button onClick={() => setCobrando(true)} disabled={!unidades}
                                                className="mt-2 btn-accent h-10 rounded-lg text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                                                Cobrar
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between px-1">
                                                <p className="text-[12px] font-medium text-content-subtle">¿Cómo paga?</p>
                                                <button onClick={() => setCobrando(false)} className="text-[12px] text-content-subtle hover:text-content dark:hover:text-white">Volver</button>
                                            </div>
                                            <div className="mt-2 space-y-1.5">
                                                {METODOS.map(m => (
                                                    <button key={m.id} onClick={() => setMetodo(m)}
                                                        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/70 dark:border-white/10 px-3 h-12 text-left hover:border-brand-500/60 hover:bg-brand-500/[0.05] transition-colors active:scale-[0.98]">
                                                        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-content dark:text-white">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />{m.nombre}
                                                        </span>
                                                        <span className="text-[12px] text-content-subtle tabular-nums">{m.moneda === "Bs." ? bs(total) : ref(total)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="mt-auto pt-3 px-1 text-[11px] text-content-subtle leading-snug">
                                                En bolívares, el monto ya viene convertido a la tasa del día.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
