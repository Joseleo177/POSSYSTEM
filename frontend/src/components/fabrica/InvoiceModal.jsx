import { useEffect, useState } from "react";
import Money from "../ui/Money";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase, fmtMoney } from "../../helpers";
import { INPUT, CARD, Field, Prefijo, SHEET_ICON, parseNum, errMsg } from "./shared";

/**
 * Revisión de la factura de una orden, con el mismo esquema que "Revisar pedido" de la caja:
 * a la izquierda lo que se factura, a la derecha cliente, moneda, serie y total. Sale por
 * cobrar, con el correlativo de la serie del almacén de la orden; el cobro sigue por Cobro o
 * por Cuentas, como cualquier factura a crédito.
 *
 * La línea lleva el producto, no el nombre del trabajo (el servidor aplica la misma regla).
 */
export default function InvoiceModal({ open, order, onClose, onDone, onEdit }) {
    const { notify, baseCurrency, activeCurrencies = [] } = useApp();
    const [series, setSeries] = useState([]);
    const [serieId, setSerieId] = useState("");
    const [currencyId, setCurrencyId] = useState("");
    const [price, setPrice] = useState("");

    useEffect(() => {
        if (!open) return;
        setPrice(order.sale_price != null ? String(order.sale_price) : "");
        setCurrencyId(baseCurrency?.id ? String(baseCurrency.id) : "");
        api.series.getMy({ warehouse_id: order.warehouse_id })
            .then(r => {
                const fact = (r.data || []).filter(s => !s.type || s.type === "factura");
                setSeries(fact);
                setSerieId(fact.length === 1 ? String(fact[0].id) : "");
            })
            .catch(() => setSeries([]));
    }, [open]);

    const p = parseNum(price);
    const save = async () => {
        if (!order.Customer) return notify("Asígnale un cliente a la orden", "err");
        if (!(p > 0)) return notify("Escribe el precio del lote", "err");
        if (!serieId) return notify("Elige la serie", "err");
        try {
            const r = await api.factory.invoice(order.id, {
                serie_id: parseInt(serieId), sale_price: p,
                ...(currencyId ? { currency_id: parseInt(currencyId) } : {}),
            });
            notify(`Factura ${r.data.invoice_number} emitida: queda por cobrar`);
            onDone?.(r.data.sale_id);
        } catch (e) { notify(errMsg(e), "err"); }
    };

    // Esc vuelve a la orden. La ventana de la orden no escucha mientras esta está encima.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose?.(); } };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || !order) return null;

    const money = (n) => fmtBase(n, baseCurrency);
    const qty = parseFloat(order.quantity) || 1;
    const lineName = toNameCase(order.Product?.name || "") || order.description;
    const margen = p > 0 ? p - order.total_cost : null;

    // El total en la moneda elegida, y debajo en la otra (Ref. ↔ Bs.), como en la caja.
    const moneda = activeCurrencies.find(c => String(c.id) === String(currencyId)) || baseCurrency;
    const monedaBs = activeCurrencies.find(c => !c.is_base) || null;
    const enBs = (n) => monedaBs ? fmtMoney(Math.round(n * (parseFloat(monedaBs.exchange_rate) || 0) * 100) / 100, monedaBs.symbol) : null;
    const principal = (n) => (moneda && !moneda.is_base ? enBs(n) : money(n));
    const secundario = (n) => (moneda && !moneda.is_base ? money(n) : enBs(n));

    const BOTON = "h-12 sm:h-11 px-5 rounded-xl text-[14px] font-semibold";

    return (
        <div className="fixed inset-0 z-[1000] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-stretch lg:items-center justify-center lg:p-6 overlay-in"
            onClick={e => e.target === e.currentTarget && onClose?.()}>
            <div role="dialog" aria-label="Revisar factura"
                className="w-full lg:max-w-5xl h-full lg:h-[82vh] bg-white dark:bg-surface-dark-2 lg:border border-black/[0.06] dark:border-white/[0.08] lg:rounded-2xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden modal-in">

                {/* Cabecera */}
                <div className="flex items-center gap-3 pl-3 pr-4 sm:pl-4 py-3 border-b border-border/60 dark:border-white/[0.06] shrink-0">
                    <button type="button" onClick={onClose} aria-label="Volver a la orden" title="Volver a la orden (Esc)"
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-content-muted dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/[0.06] shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="min-w-0">
                        <div className="text-[16px] font-semibold text-content dark:text-white">Revisar factura</div>
                        <div className="text-[12px] text-content-subtle truncate">{order.code} · Esc vuelve a la orden</div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:flex">
                    {/* Lo que se factura */}
                    <div className="lg:flex-1 lg:overflow-y-auto p-4 sm:p-5">
                        <div className="flex items-center gap-3">
                            <span className="w-14 h-14 rounded-xl bg-surface-2 dark:bg-white/[0.06] text-content-subtle flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={SHEET_ICON} /></svg>
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[14px] font-semibold text-content dark:text-white break-words">{lineName}</div>
                                <div className="text-[13px] text-content-subtle tabular-nums">
                                    {qty.toLocaleString("es-VE")} {qty === 1 ? "unidad" : "unidades"}
                                    {p > 0 && <> × <Money value={money(p / qty)} /></>}
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                {p > 0 ? (
                                    <>
                                        <Money value={principal(p)} className="text-[15px] font-semibold text-content dark:text-white" />
                                        {secundario(p) && <div className="text-[12px] text-content-subtle tabular-nums"><Money value={secundario(p)} /></div>}
                                    </>
                                ) : <span className="text-[13px] text-amber-700 dark:text-amber-400 font-medium">Sin precio</span>}
                            </div>
                        </div>
                        <p className="text-[12px] text-content-subtle mt-4 pl-[68px]">
                            De la orden {order.code}{order.description ? ` · ${order.description}` : ""}. El trabajo queda en la orden; la factura lleva el producto.
                        </p>
                    </div>

                    {/* Cliente, moneda, serie y total */}
                    <div className="lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-l border-t lg:border-t-0 border-border/60 dark:border-white/[0.06] p-4 sm:p-5 space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] font-medium text-content dark:text-white">Cliente</span>
                                {!order.Customer && <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400">Falta</span>}
                            </div>
                            {order.Customer ? (
                                <div className={`${CARD} px-3.5 py-2.5 flex items-center justify-between gap-3`}>
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(order.Customer.name)}</div>
                                        {order.Customer.rif && <div className="text-[12px] text-content-subtle">{order.Customer.rif}</div>}
                                    </div>
                                    <button type="button" onClick={onEdit} className="text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white shrink-0">Cambiar</button>
                                </div>
                            ) : (
                                <button type="button" onClick={onEdit} className="btn-outline w-full h-10 rounded-lg text-[13px] font-medium">
                                    Asignar cliente en la orden
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Moneda">
                                <CustomSelect value={currencyId} onChange={setCurrencyId}
                                    options={activeCurrencies.map(c => ({ value: String(c.id), label: c.code }))} />
                            </Field>
                            <Field label="Serie">
                                {series.length ? (
                                    <CustomSelect value={serieId} onChange={setSerieId} placeholder="Elegir…"
                                        options={series.map(s => ({ value: String(s.id), label: s.prefix || s.name }))} />
                                ) : (
                                    <div className="h-10 flex items-center text-[12px] text-amber-700 dark:text-amber-400">Sin series en este almacén</div>
                                )}
                            </Field>
                        </div>

                        <Field label="Precio del lote">
                            <div className="relative">
                                <Prefijo>{baseCurrency?.symbol || "Ref."}</Prefijo>
                                <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" autoComplete="off" data-autofocus
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
                                    placeholder="0.00" className={`${INPUT} pl-11 tabular-nums`} />
                            </div>
                        </Field>

                        <div className={`${CARD} px-4 py-3`}>
                            <div className="flex justify-between text-[12px] text-content-subtle">
                                <span>Costo de la orden</span><Money value={money(order.total_cost)} />
                            </div>
                            <div className="border-t border-border/60 dark:border-white/[0.06] mt-2.5 pt-2.5 flex items-end justify-between gap-3">
                                <span className="text-[13px] font-semibold text-content dark:text-white">Total</span>
                                <div className="text-right">
                                    <Money value={principal(p || 0)} className="text-[22px] font-bold tracking-[-0.01em] text-content dark:text-white" />
                                    {secundario(p || 0) && <div className="text-[12px] text-content-subtle tabular-nums"><Money value={secundario(p || 0)} /></div>}
                                </div>
                            </div>
                            {margen != null && (
                                <div className={`text-[12px] mt-2 ${margen < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-content-subtle"}`}>
                                    {margen < 0 ? "Pérdida" : "Utilidad"} <Money value={money(Math.abs(margen))} /> · {Math.round((margen / p) * 100)}%
                                </div>
                            )}
                            {order.status === "abierta" && (
                                <div className="text-[12px] text-content-subtle mt-1">La orden sigue abierta: el costo puede subir con lo que falte por consumir.</div>
                            )}
                        </div>
                        <p className="text-[12px] text-content-subtle">Sale por cobrar: el cobro se registra en Cobro o en Cuentas.</p>
                    </div>
                </div>

                {/* Pie */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border/60 dark:border-white/[0.06] shrink-0">
                    <button type="button" onClick={onClose} className="h-11 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white">Volver a la orden</button>
                    <Button onClick={save} disabled={!series.length || !order.Customer} className={BOTON}>
                        Facturar{p > 0 ? <span className="ml-1.5"><Money value={money(p)} /></span> : null}
                    </Button>
                </div>
            </div>
        </div>
    );
}
