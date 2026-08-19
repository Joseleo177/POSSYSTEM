import Modal from "./ui/Modal";
import { useApp } from "../context/AppContext";
import { fmtMoney, fmtDate, printKitchenOrder } from "../helpers";

const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : String(n);
};

/**
 * Previsualiza una cuenta en espera o un pedido del catálogo antes de mandarla al papel.
 *
 * En un restaurante el pedido se despacha antes de cobrarlo: hay que poder verlo completo
 * —y mandar la comanda a la cocina— sin recuperarlo al carrito, que es lo único que había
 * antes y además lo bloquea para las otras cajas.
 */
export default function OrderPreviewModal({ open, onClose, order, convertToDisplay, convertToSecondary, currSym, secondaryCurrency }) {
    const { companyInfo, printerWidth, baseCurrency } = useApp();

    if (!open || !order) return null;

    const sym = currSym || baseCurrency?.symbol || "Ref.";
    const conv = n => (convertToDisplay ? convertToDisplay(parseFloat(n || 0)) : parseFloat(n || 0));
    const fmtP = n => fmtMoney(conv(n), sym);

    const isWebOrder = order.status === "pedido";
    const customer = order.customer_name || order.web_customer_name || "Cliente General";
    const items = order.items || [];
    const total = parseFloat(order.total || 0);
    const totalSecondary = convertToSecondary ? convertToSecondary(total) : null;
    const ref = order.invoice_number || `#${order.id}`;

    // La pantalla sí muestra importes —el cajero necesita saber cuánto suma la cuenta—, pero
    // el papel sale siempre sin ellos: la comanda se despacha, no se cobra.
    const imprimir = () => printKitchenOrder(order, companyInfo, printerWidth);

    return (
        <Modal open={open} onClose={onClose} title={`Pedido ${ref}`} width={420}>
            {/* Cliente — es el dato que se canta al entregar, va primero y grande. */}
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl p-4 mb-3">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Cliente</span>
                    {isWebOrder && (
                        <span className="text-[8px] font-black uppercase tracking-widest bg-info text-white px-1.5 py-0.5 rounded">Web</span>
                    )}
                </div>
                <div className="text-base font-black uppercase tracking-tight text-content dark:text-white leading-tight break-words">
                    {customer}
                </div>
                {(order.customer_rif || order.web_customer_phone) && (
                    <div className="text-[11px] font-bold text-content-subtle tabular-nums mt-0.5">
                        {[order.customer_rif, order.web_customer_phone].filter(Boolean).join(" · ")}
                    </div>
                )}
            </div>

            {/* Datos de la orden */}
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl p-4 mb-3 space-y-1">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Fecha</span>
                    <span className="text-content dark:text-content-dark font-medium">{fmtDate(order.created_at)}</span>
                </div>
                {order.employee_name && (
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-content-muted dark:text-content-dark-muted">Atiende</span>
                        <span className="text-content dark:text-content-dark font-medium uppercase">{order.employee_name}</span>
                    </div>
                )}
                <div className="flex justify-between items-center text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Estado</span>
                    <span className={`font-black uppercase tracking-tight ${isWebOrder ? "text-info" : "text-brand-500"}`}>
                        {isWebOrder ? "Pedido web" : "En espera"}
                    </span>
                </div>
            </div>

            {/* Nota del cliente: en un pedido web es media comanda (sin cebolla, para llevar…). */}
            {order.web_note && (
                <div className="rounded-2xl p-4 mb-3 bg-warning/10 border border-warning/25">
                    <span className="text-[9px] font-black uppercase tracking-widest text-warning block mb-1">Nota</span>
                    <span className="text-xs font-bold text-content dark:text-white break-words">{order.web_note}</span>
                </div>
            )}

            {/* Detalle */}
            <div className="rounded-2xl border border-border/20 dark:border-white/5 overflow-hidden mb-3">
                {items.map((i, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 border-border/15 dark:border-white/5">
                        <span className="w-8 shrink-0 text-center text-sm font-black tabular-nums text-brand-500">{fmtQty(i.quantity)}</span>
                        <span className="flex-1 min-w-0 text-xs font-bold uppercase text-content dark:text-white break-words">{i.name}</span>
                        <span className="shrink-0 text-xs font-black tabular-nums text-content dark:text-white">
                            {fmtP(i.subtotal ?? (parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 0))}
                        </span>
                    </div>
                ))}
            </div>

            <div className="flex justify-between items-center mb-4 px-1">
                <span className="text-xs font-black uppercase tracking-tighter text-content dark:text-content-dark">Total</span>
                <div className="text-right">
                    <div className="text-base font-black leading-none text-content dark:text-white tabular-nums">{fmtMoney(conv(total), sym)}</div>
                    {secondaryCurrency && totalSecondary !== null && (
                        <div className="text-[10px] font-bold text-content-subtle tabular-nums mt-0.5">
                            ≈ {fmtMoney(totalSecondary, secondaryCurrency.symbol)}
                        </div>
                    )}
                </div>
            </div>

            {/* Una sola impresión: cliente y productos, sin precios. */}
            <div className="flex gap-2.5">
                <button onClick={onClose} className="btn-md btn-secondary w-full">CERRAR</button>
                <button
                    onClick={imprimir}
                    className="btn-md btn-primary w-full"
                    title="Comanda: cliente y productos, sin precios"
                    style={{ flex: 1.8 }}
                >
                    IMPRIMIR COMANDA
                </button>
            </div>
        </Modal>
    );
}
