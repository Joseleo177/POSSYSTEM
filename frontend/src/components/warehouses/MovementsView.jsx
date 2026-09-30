import { useState, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import CustomSelect from "../ui/CustomSelect";
import StockQty, { splitQty } from "../ui/StockQty";
import { useDebounce } from "../../hooks/useDebounce";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { toNameCase } from "../../helpers";
import ProductKardex from "./ProductKardex";
import { ICON } from "./movementMeta";

// Las preferencias van por empresa y usuario: el navegador se comparte entre empresas (un
// superusuario entra a varias) y sin esto "Consultados hace poco" mostraba productos de otra.
const claves = (emp) => {
    const sufijo = `${emp?.company_id ?? "0"}_${emp?.id ?? "0"}`;
    return { RECENT_KEY: `kardex_recent_${sufijo}`, WH_KEY: `kardex_warehouse_${sufijo}` };
};
// Las claves viejas, sin empresa, se descartan.
try { localStorage.removeItem("kardex_recent"); localStorage.removeItem("kardex_warehouse"); } catch { /* sin almacenamiento */ }

// Preferencias del visor: se leen y escriben con try/catch porque el almacenamiento puede no
// estar (ventana privada, datos bloqueados) y la pantalla tiene que funcionar igual.
const leer = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const Svg = ({ d, className = "w-4 h-4", sw = 2 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d={d} />
    </svg>
);

function Thumb({ p, size = "w-9 h-9", rounded = "rounded-lg" }) {
    return (
        <div className={`${size} ${rounded} bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative`}>
            {p.image_url ? (
                <img src={resolveImageUrl(p.image_url)} alt="" loading="lazy" onError={imgRetryOnError}
                    className="absolute inset-0 w-full h-full object-cover" />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-content-subtle/40">
                    {p.name?.charAt(0)}
                </div>
            )}
        </div>
    );
}

// Buscador de productos con su existencia. Teclado completo: flechas, Enter y Escape; el
// lector de código de barras también sirve, porque el código exacto es un criterio más.
function ProductPicker({ warehouseId, onSelect, autoFocus }) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [idx, setIdx] = useState(0);
    const dq = useDebounce(q, 250);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        let vivo = true;
        setLoading(true);
        const params = { search: dq };
        if (warehouseId) params.warehouse_id = warehouseId;
        api.warehouses.movementProducts(params)
            .then(r => { if (vivo) { setItems(r.data || []); setIdx(0); } })
            .catch(() => { if (vivo) setItems([]); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [dq, open, warehouseId]);

    useEffect(() => {
        if (!open) return;
        const fuera = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", fuera);
        document.addEventListener("touchstart", fuera);
        return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("touchstart", fuera); };
    }, [open]);

    const elegir = (p) => {
        onSelect(p);
        setQ("");
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKey = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx(i => Math.min(i + 1, items.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === "Enter" && items[idx]) { e.preventDefault(); elegir(items[idx]); }
        else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };

    return (
        <div ref={boxRef} className="relative flex-1 min-w-0">
            <Svg d={ICON.search} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" />
            <input
                ref={inputRef}
                type="text"
                value={q}
                autoFocus={autoFocus}
                onChange={e => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKey}
                placeholder="Producto o código…"
                autoComplete="off"
                spellCheck={false}
                className="input h-10 pl-10 pr-9 text-[14px]"
            />
            {q && (
                <button onClick={() => { setQ(""); inputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white"
                    aria-label="Borrar búsqueda">
                    <Svg d={ICON.close} className="w-3.5 h-3.5" sw={2.4} />
                </button>
            )}

            {open && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.3)] overflow-hidden popover-in">
                    <div className="max-h-[min(420px,60vh)] overflow-y-auto custom-scrollbar py-1">
                        {loading && items.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[13px] text-content-subtle">Buscando…</div>
                        ) : items.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[13px] text-content-subtle">
                                {dq ? `Nada coincide con "${dq}"` : "No hay productos con inventario"}
                            </div>
                        ) : items.map((p, i) => {
                            const [n, u] = splitQty(p.stock, p.unit);
                            return (
                                <button
                                    key={p.id}
                                    onMouseEnter={() => setIdx(i)}
                                    onClick={() => elegir(p)}
                                    className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${i === idx ? "bg-surface-2 dark:bg-white/[0.05]" : ""}`}
                                >
                                    <Thumb p={p} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{p.name}</div>
                                        <div className="text-[12px] text-content-subtle truncate">
                                            {toNameCase(p.category_name || "General")}{p.barcode ? ` · ${p.barcode}` : ""}
                                        </div>
                                    </div>
                                    <StockQty qty={p.stock} value={n} unit={u} min={p.min_stock} size="text-[13px]" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// Pestaña Movimientos de Inventario: buscar un producto y leer su historial completo —ventas,
// compras, devoluciones, transferencias y ajustes— con la existencia después de cada uno.
export default function MovementsView({ warehouses = [] }) {
    const { employee } = useApp();
    const { RECENT_KEY, WH_KEY } = claves(employee);
    const [product, setProduct] = useState(null);
    const [recent, setRecent] = useState(() => { const r = leer(RECENT_KEY, []); return Array.isArray(r) ? r : []; });

    // Por defecto un almacén concreto, no "Todos": el kardex se lee por sucursal, y sumando
    // todas cada transferencia aparece dos veces (sale de una y entra en otra).
    const [warehouseId, setWarehouseId] = useState(() => {
        const g = leer(WH_KEY, null);
        return g == null ? "" : String(g);
    });
    // Los almacenes pueden llegar después del primer render. Sin preferencia guardada, o si la
    // guardada ya no es visible para este usuario, se toma el primero.
    useEffect(() => {
        if (!warehouses.length) return;
        const g = leer(WH_KEY, null);
        const valido = warehouseId === "" ? (g === "" && warehouses.length > 1) : warehouses.some(w => String(w.id) === warehouseId);
        if (!valido) setWarehouseId(String(warehouses[0].id));
    }, [warehouses]); // eslint-disable-line react-hooks/exhaustive-deps

    // Aviso cuando se cambió de almacén solo, para que no parezca que el filtro se movió sin razón.
    const [aviso, setAviso] = useState(null);

    const cambiarAlmacen = (v) => { setWarehouseId(v); guardar(WH_KEY, v); setAviso(null); };

    // Al elegir un producto: si en el almacén seleccionado no tiene existencias pero en otro
    // sí, se muestra ese. Antes el historial abría en el primer almacén de la lista y salía
    // vacío aunque el producto viviera en otro, que es lo primero que se interpreta como falla.
    // No se guarda como preferencia: es para este producto.
    const ubicar = async (p) => {
        setAviso(null);
        if (warehouses.length < 2 || warehouseId === "") return;
        try {
            const r = await api.warehouses.movements({ product_id: p.id, limit: 1 });
            const reparto = r.data?.warehouses || [];
            const aqui = reparto.find(w => String(w.id) === warehouseId);
            if (aqui && parseFloat(aqui.qty) !== 0) return;
            const otro = reparto.filter(w => parseFloat(w.qty) > 0).sort((a, b) => b.qty - a.qty)[0];
            if (!otro) return;
            const desde = warehouses.find(w => String(w.id) === warehouseId)?.name;
            setWarehouseId(String(otro.id));
            setAviso({ desde: toNameCase(desde || ""), hacia: toNameCase(otro.name) });
        } catch { /* sin reparto: se queda el almacén elegido */ }
    };

    const elegir = (p) => {
        setProduct(p);
        ubicar(p);
        const corto = { id: p.id, name: p.name, unit: p.unit, image_url: p.image_url, category_name: p.category_name };
        const nuevos = [corto, ...recent.filter(r => r.id !== p.id)].slice(0, 8);
        setRecent(nuevos);
        guardar(RECENT_KEY, nuevos);
    };

    const opcionesAlmacen = [
        ...(warehouses.length > 1 ? [{ value: "", label: "Todos los almacenes" }] : []),
        ...warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) })),
    ];

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* ── Buscador ── */}
            {/* Una sola fila también en el teléfono: el almacén se achica y el buscador se
                queda con el resto. Apilados, costaban dos renglones de pantalla. */}
            <div className="shrink-0 px-4 lg:px-6 py-3 border-b border-border/60 dark:border-white/[0.06] flex items-center gap-2">
                {/* Sin almacén: la existencia que muestra el buscador es la de todos los almacenes
                    del usuario, para no anunciar "0" de algo que está en otra sucursal. */}
                <ProductPicker warehouseId="" onSelect={elegir} autoFocus={!product} />
                {opcionesAlmacen.length > 1 && (
                    <div className="w-[118px] sm:w-52 shrink-0">
                        <CustomSelect value={warehouseId} onChange={cambiarAlmacen} options={opcionesAlmacen} height="h-10" />
                    </div>
                )}
            </div>

            {product && aviso && (
                <div className="shrink-0 mx-4 lg:mx-6 mt-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] px-3 py-2 flex items-center gap-2 text-[13px]">
                    <Svg d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-content-subtle shrink-0" />
                    <span className="min-w-0 flex-1 text-content-muted dark:text-white/70">
                        En <span className="font-semibold text-content dark:text-white">{aviso.desde}</span> no hay existencias de este producto; te muestro <span className="font-semibold text-content dark:text-white">{aviso.hacia}</span>.
                    </span>
                    <button onClick={() => setAviso(null)} className="row-icon !w-7 !h-7 shrink-0" aria-label="Cerrar aviso"><Svg d={ICON.close} className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {product ? (
                <ProductKardex
                    key={product.id}
                    productId={product.id}
                    warehouseId={warehouseId}
                    actions={
                        <button onClick={() => setProduct(null)} className="row-icon -mr-2 -mt-1" title="Cerrar historial" aria-label="Cerrar historial">
                            <Svg d={ICON.close} />
                        </button>
                    }
                />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="max-w-2xl mx-auto px-4 lg:px-6 py-10 lg:py-16">
                        <div className="text-center">
                            <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                                <Svg d={ICON.clock} className="w-6 h-6" sw={1.8} />
                            </div>
                            <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-content dark:text-white">Historial de un producto</h3>
                            <p className="mt-1.5 text-[13px] text-content-subtle leading-relaxed max-w-md mx-auto">
                                Busca un producto para ver cada venta, compra, devolución, transferencia y ajuste que movió su inventario, con la existencia que quedó después de cada uno.
                            </p>
                        </div>

                        {recent.length > 0 && (
                            <div className="mt-8">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[12px] font-medium text-content-subtle">Consultados hace poco</span>
                                    <button onClick={() => { setRecent([]); guardar(RECENT_KEY, []); }}
                                        className="text-[12px] text-content-subtle hover:text-content dark:hover:text-white">Limpiar</button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {recent.map(p => (
                                        <button key={p.id} onClick={() => elegir(p)}
                                            className="flex items-center gap-3 p-2.5 rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-brand-500/40 hover:bg-brand-500/[0.03] text-left transition-colors active:scale-[0.99]">
                                            <Thumb p={p} size="w-10 h-10" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] font-semibold text-content dark:text-white truncate">{p.name}</div>
                                                <div className="text-[12px] text-content-subtle truncate">{toNameCase(p.category_name || "General")}</div>
                                            </div>
                                            <Svg d="M9 5l7 7-7 7" className="w-4 h-4 text-content-subtle/60" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
