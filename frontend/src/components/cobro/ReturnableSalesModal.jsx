import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../services/api";
import { hasTopOverlay } from "../../helpers/overlayGuard";
import { toNameCase } from "../../helpers";
import ReturnModal from "../ReturnModal";
import Money from "../ui/Money";
import StatusMark from "../ui/StatusMark";
import { Spinner } from "../ui/Spinner";
import { LedgerSkeleton } from "../ui/Ledger";

// Lo mismo que habilita el botón Devolver en Contabilidad → Transacciones: una factura ya
// emitida, cobrada o no. El borrador aún no es documento fiscal y la anulada o devuelta del
// todo no tiene nada que devolver.
const DEVOLVIBLES = ["pagado", "parcial", "pendiente"];

const STATUS_MAP = {
    pagado:    { label: "Pagada",    tone: "success", quiet: "check" },
    parcial:   { label: "Parcial",   tone: "warning" },
    pendiente: { label: "Por cobrar", tone: "neutral" },
};

// Devoluciones y cambios desde la caja. El motor es el mismo ReturnModal de Contabilidad;
// esto solo le da al cajero cómo llegar a la factura sin tener acceso a esa pantalla.
export default function ReturnableSalesModal({ open, onClose, onDone, baseCurrency, warehouseId, notify }) {
    const [sales, setSales]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [search, setSearch]       = useState("");
    const [opening, setOpening]     = useState(null);
    const [returnSale, setReturnSale] = useState(null);
    const searchRef = useRef(null);
    const sym = baseCurrency?.symbol || "Ref.";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const sp = new URLSearchParams({ limit: 50, summary: "0" });
            DEVOLVIBLES.forEach(s => sp.append("status", s));
            if (search.trim()) sp.set("search", search.trim());
            // Solo la sucursal de esta caja: la mercancía devuelta entra a su inventario y el
            // reembolso sale de sus cajas.
            if (warehouseId) sp.set("warehouse_id", warehouseId);
            const r = await api.sales.getAll(sp);
            setSales(r.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search, warehouseId]);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [open, load, search]);

    useEffect(() => {
        if (!open) { setSearch(""); setReturnSale(null); setOpening(null); return; }
        // Con teclado físico el cursor queda listo para teclear o escanear el número del
        // ticket; en un teléfono subiría el teclado sin que nadie lo pida.
        if (window.matchMedia("(min-width: 1024px)").matches) requestAnimationFrame(() => searchRef.current?.focus());
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key !== "Escape") return;
            // Con la devolución abierta, Escape es de ella: la cierra su propio Modal.
            if (returnSale || hasTopOverlay()) return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, onClose, returnSale]);

    // La lista no trae las líneas con lo ya devuelto de cada una: el modal las necesita para
    // no dejar devolver dos veces lo mismo.
    const openSale = async (sale) => {
        setOpening(sale.id);
        try {
            const r = await api.sales.getOne(sale.id);
            setReturnSale(r.data);
        } catch (e) {
            notify?.(e.message || "No se pudo abrir la factura", "err");
        } finally {
            setOpening(null);
        }
    };

    // Enter con el número escaneado o tecleado: si una sola factura coincide (o una coincide
    // exacto), se abre sin tener que buscarla con el ratón.
    const onSearchKeyDown = (e) => {
        if (e.key !== "Enter" || loading) return;
        const term = search.trim().toLowerCase();
        const exacta = sales.find(s => (s.invoice_number || "").toLowerCase() === term);
        const unica = sales.length === 1 ? sales[0] : null;
        const elegida = exacta || unica;
        if (elegida) { e.preventDefault(); openSale(elegida); }
    };

    if (!open) return null;

    const fmt = (n) => `${sym}${parseFloat(n || 0).toFixed(2)}`;
    const fmtDate = (d) => {
        if (!d) return "—";
        const dt = new Date(d);
        return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} · ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
    };
    const devuelto = (sale) => parseFloat(sale.total_returned || 0);
    const clientName = (sale) => toNameCase(sale.customer_name) || null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 overlay-in" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-3xl bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden modal-in" style={{ maxHeight: "85vh" }} onKeyDown={e => e.stopPropagation()}>

                <div className="flex items-start justify-between gap-4 pl-6 pr-4 pt-5 pb-4 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-bold tracking-[-0.015em] text-content dark:text-white">Devolución o cambio</h2>
                        <p className="text-[13px] text-content-subtle mt-0.5">Elige la factura de la que vuelve la mercancía.</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg text-content-subtle dark:text-white/40 hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 pb-4 shrink-0 border-b border-border/60 dark:border-white/[0.06]">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder="Número de factura, cliente o cédula"
                            autoComplete="off"
                            className="input h-10 pl-9 w-full"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {loading && sales.length === 0 ? (
                        <table className="table-ledger"><tbody><LedgerSkeleton cols={5} rows={5} /></tbody></table>
                    ) : sales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-1 text-center px-6">
                            <div className="w-11 h-11 mb-2 rounded-xl bg-surface-2 dark:bg-white/[0.05] flex items-center justify-center text-content-subtle">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                            </div>
                            <span className="text-[13px] font-semibold text-content dark:text-white">{search ? "Ninguna factura coincide" : "Sin facturas en esta sucursal"}</span>
                            <span className="text-[12px] text-content-subtle">{search ? "Prueba con el número completo del ticket o el nombre del cliente." : "Aquí aparecen las ventas facturadas de esta caja."}</span>
                        </div>
                    ) : (
                      <>
                        {/* Móvil: tarjetas; tocar la tarjeta abre la devolución. */}
                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06]">
                            {sales.map(sale => (
                                <button
                                    key={sale.id}
                                    type="button"
                                    onClick={() => openSale(sale)}
                                    disabled={opening === sale.id}
                                    className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-surface-2 dark:active:bg-white/[0.04]"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[14px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums">{sale.invoice_number || `#${sale.id}`}</span>
                                            <Money value={fmt(sale.total)} className="text-[14px] font-semibold text-content dark:text-white" />
                                        </div>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[13px] text-content-muted truncate">{clientName(sale) || "Sin cliente"}</span>
                                            {devuelto(sale) > 0 && (
                                                <span className="text-[12px] text-amber-700 dark:text-amber-400 whitespace-nowrap">Devuelto <Money value={fmt(devuelto(sale))} /></span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-[12px] text-content-subtle tabular-nums">{fmtDate(sale.created_at)}</span>
                                            <StatusMark status={sale.status} map={STATUS_MAP} />
                                        </div>
                                    </div>
                                    {opening === sale.id
                                        ? <Spinner className="w-4 h-4 text-content-subtle shrink-0" />
                                        : <svg className="w-4 h-4 text-content-subtle/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                                </button>
                            ))}
                        </div>

                        <table className="hidden lg:table table-ledger table-fixed">
                            <colgroup>
                                <col className="w-[170px]" />
                                <col />
                                <col className="w-[140px]" />
                                <col className="w-[110px]" />
                                <col className="w-[110px]" />
                            </colgroup>
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="pl-6">Factura</th>
                                    <th>Cliente</th>
                                    <th className="text-right">Total</th>
                                    <th>Estado</th>
                                    <th className="pr-6"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map(sale => (
                                    <tr key={sale.id}>
                                        <td className="pl-6">
                                            <div className="text-[14px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums truncate">{sale.invoice_number || `#${sale.id}`}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums truncate">{fmtDate(sale.created_at)}</div>
                                        </td>
                                        <td className="max-w-0">
                                            {clientName(sale)
                                                ? <div className="font-semibold text-content dark:text-white truncate">{clientName(sale)}</div>
                                                : <div className="text-content-subtle">Sin cliente</div>}
                                            {sale.customer_rif && <div className="text-[12px] text-content-subtle tabular-nums truncate">{sale.customer_rif}</div>}
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(sale.total)} className="text-[14px] font-semibold text-content dark:text-white" />
                                            {/* Lo ya devuelto, solo cuando hay: avisa que parte de la
                                                factura no se puede volver a devolver. */}
                                            {devuelto(sale) > 0 && (
                                                <div className="text-[12px] text-amber-700 dark:text-amber-400 whitespace-nowrap">Devuelto <Money value={fmt(devuelto(sale))} /></div>
                                            )}
                                        </td>
                                        <td><StatusMark status={sale.status} map={STATUS_MAP} /></td>
                                        <td className="pr-6 text-right">
                                            <button
                                                onClick={() => openSale(sale)}
                                                disabled={opening === sale.id}
                                                className="btn-outline h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-[0.98]"
                                            >
                                                {opening === sale.id && <Spinner className="w-3.5 h-3.5" />}
                                                Devolver
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                      </>
                    )}
                </div>

                {!loading && sales.length > 0 && (
                    <div className="px-6 py-3 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] shrink-0">
                        <span className="text-[12px] text-content-subtle">
                            {search ? `${sales.length} ${sales.length === 1 ? "coincidencia" : "coincidencias"}` : "Las 50 más recientes. Para una más vieja, búscala por número o cliente."}
                        </span>
                    </div>
                )}
            </div>

            {returnSale && (
                <div onClick={e => e.stopPropagation()}>
                    <ReturnModal
                        open
                        sale={returnSale}
                        onClose={() => setReturnSale(null)}
                        // El stock cambió (entra lo devuelto y, en un cambio, sale lo nuevo):
                        // la grilla de la caja tiene que enterarse.
                        onReturnSuccess={() => { load(); onDone?.(); }}
                        notify={notify}
                    />
                </div>
            )}
        </div>
    );
}
