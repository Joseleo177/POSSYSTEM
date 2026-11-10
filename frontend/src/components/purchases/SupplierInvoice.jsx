import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import Segmented from "../ui/Segmented";
import Money from "../ui/Money";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { facturaProveedor, renglonesIva, OPCIONES_TASA, ALICUOTAS } from "../../helpers/iva";
import { fmtDateShort, todayISO, toNameCase } from "../../helpers";

// Factura del proveedor de una compra (IVA, Libro de compras). Se carga aparte de las líneas, en
// cualquier estado de la orden —también ya recibida—, porque el papel del proveedor suele llegar
// después que la mercancía. No toca costos ni inventario: el costo de cada línea ya va SIN IVA.
// Ver backend/src/services/purchases/fiscalCompra.js.

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const SECTION = "bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5";
const QUITAR = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";

const Prefijo = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

function Field({ label, hint, children }) {
    return (
        <div className="min-w-0">
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

// Moneda y tasa con que se cargó la factura (las de la orden guardada).
function monedaDeCompra(detail, activeCurrencies, baseCurrency) {
    const rate = parseFloat(detail?.exchange_rate) > 0 ? parseFloat(detail.exchange_rate) : 1;
    const cur = (activeCurrencies || []).find(c => c.id === detail?.currency_id);
    return { rate, sym: cur && !cur.is_base ? (cur.symbol || cur.code) : (baseCurrency?.symbol || "Ref.") };
}

// Tarjeta del detalle de la compra: qué factura tiene y cómo se desglosa.
export default function SupplierInvoiceCard({ detail, onSaved, disabled }) {
    const { activeCurrencies, baseCurrency, can } = useApp();
    const [open, setOpen] = useState(false);
    const { rate, sym } = monedaDeCompra(detail, activeCurrencies, baseCurrency);
    const charges = detail?.charges || [];
    const factura = detail?.factura;
    const tieneAlgo = detail?.fiscal || charges.length > 0;
    const puedeEditar = can("purchases.edit");
    // Factura de servicios: sus líneas son los cargos y no hay productos.
    const servicios = detail?.kind === "servicios";

    return (
        <div className={`${SECTION} p-4 sm:p-5`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-content dark:text-white">{servicios ? "Factura de servicios" : "Factura del proveedor"}</p>
                    <p className="text-[12px] text-content-subtle mt-0.5">
                        {detail?.fiscal
                            ? [`N° ${detail.supplier_invoice_number}`, `control ${detail.supplier_control_number}`, detail.supplier_invoice_date && fmtDateShort(detail.supplier_invoice_date)].filter(Boolean).join(" · ")
                            : charges.length
                                ? "Sin factura fiscal: no entra al Libro de compras"
                                : "Carga el número, el control y el IVA del papel del proveedor para el Libro de compras."}
                    </p>
                </div>
                {puedeEditar && (
                    <button
                        onClick={() => setOpen(true)}
                        disabled={disabled}
                        title={disabled ? "Guarda primero los cambios de la orden" : undefined}
                        className="btn-outline h-9 sm:h-8 px-3.5 rounded-lg text-[12px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40"
                    >
                        {tieneAlgo ? "Editar" : "Cargar factura"}
                    </button>
                )}
            </div>

            {tieneAlgo && factura && (() => {
                const cargosDoc = charges.map(c => ({ ...c, doc: Math.round(parseFloat(c.amount) * rate * 100) / 100 }));
                // Con factura, los renglones son los del papel (base, IVA, exento) y los cargos ya
                // están dentro de la base: se nombran aparte para no sumarlos dos veces. Sin factura,
                // productos y cargos en renglones que suman el total.
                // Una factura de servicios se lee como el papel: sus líneas (sin IVA) y debajo la base, el
                // IVA y el total.
                const renglones = servicios
                    ? (detail.fiscal ? renglonesIva(factura) : [])
                    : detail.fiscal
                        ? renglonesIva(factura)
                        : [{ label: "Productos", monto: factura.total - cargosDoc.reduce((a, c) => a + c.doc, 0) },
                           ...cargosDoc.map(c => ({ label: c.description, monto: c.doc }))];
                return (
                    <dl className="mt-4 pt-3 border-t border-border/60 dark:border-white/[0.06] space-y-1 text-[13px]">
                        {servicios && cargosDoc.map(c => (
                            <div key={c.id} className="flex justify-between gap-3">
                                <dt className="min-w-0">
                                    <span className="text-content dark:text-white">{c.description}</span>
                                    <span className="text-content-subtle">
                                        {[c.category_name, detail.fiscal ? (parseFloat(c.iva_rate) ? `${parseFloat(c.iva_rate)} %` : "Exento") : null].filter(Boolean).map(t => ` · ${t}`).join("")}
                                    </span>
                                </dt>
                                <dd className="shrink-0"><Money value={`${sym} ${fmt2(c.doc)}`} /></dd>
                            </div>
                        ))}
                        {servicios && renglones.length > 0 && <div className="pt-1 mt-1 border-t border-dashed border-border/60 dark:border-white/[0.08]" />}
                        {renglones.map(r => (
                            <div key={r.label} className="flex justify-between gap-3 text-content-subtle">
                                <dt className="truncate">{r.label}</dt><dd className="shrink-0"><Money value={`${sym} ${fmt2(r.monto)}`} /></dd>
                            </div>
                        ))}
                        <div className="flex justify-between items-baseline gap-3 pt-1.5">
                            <dt className="font-semibold text-content dark:text-white">Total de la factura</dt>
                            <dd className="shrink-0"><Money value={`${sym} ${fmt2(factura.total)}`} className="text-[15px] font-semibold text-content dark:text-white" /></dd>
                        </div>
                        {!servicios && detail.fiscal && cargosDoc.length > 0 && (
                            <p className="pt-1 text-[12px] text-content-subtle">
                                Incluye {cargosDoc.map(c => `${c.description.toLowerCase()} ${sym} ${fmt2(c.doc)}${c.category_name ? ` (${c.category_name})` : ""}`).join(", ")}.
                            </p>
                        )}
                    </dl>
                );
            })()}

            {open && (
                <SupplierInvoiceModal
                    detail={detail}
                    rate={rate}
                    sym={sym}
                    onClose={() => setOpen(false)}
                    onSaved={(data) => { setOpen(false); onSaved?.(data); }}
                />
            )}
        </div>
    );
}

// Estado y cuenta de la factura del proveedor, para el modal del detalle y para el alta de una
// factura de servicios. `detail`: la compra (o un borrador vacío al crear); `rate`: tasa de la
// factura, que en el alta cambia con la moneda elegida.
export function useFacturaProveedor(detail, rate, { servicios = false, ivaEnabled = true } = {}) {
    const [fiscal, setFiscal] = useState(ivaEnabled && (detail.fiscal || !(detail.charges || []).length));
    const [rif, setRif] = useState(detail.supplier_rif || detail.supplier_default_rif || "");
    const [numero, setNumero] = useState(detail.supplier_invoice_number || "");
    const [control, setControl] = useState(detail.supplier_control_number || "");
    const [fecha, setFecha] = useState(detail.supplier_invoice_date || todayISO());
    // Alícuota de cada producto: la guardada o la de su ficha.
    const [tasas, setTasas] = useState(() => Object.fromEntries((detail.items || []).map(i =>
        [i.id, i.iva_rate != null ? String(parseFloat(i.iva_rate)) : String(ALICUOTAS[i.iva_tipo] ?? 16)])));
    // Los cargos (o las líneas de una factura de servicios) se teclean en la moneda de la factura y
    // se guardan en base. Una factura de servicios arranca con una línea vacía.
    const [cargos, setCargos] = useState(() => {
        const guardados = (detail.charges || []).map(c => ({
            description: c.description,
            amount: fmt2(parseFloat(c.amount) * rate),
            iva_rate: c.iva_rate != null ? String(parseFloat(c.iva_rate)) : "16",
            expense_category_id: c.expense_category_id ? String(c.expense_category_id) : "",
        }));
        return guardados.length || !servicios ? guardados : [{ description: "", amount: "", iva_rate: "16", expense_category_id: "" }];
    });
    const [ajuste, setAjuste] = useState(parseFloat(detail.iva_adjust) ? String(parseFloat(detail.iva_adjust)) : "");
    const [categorias, setCategorias] = useState([]);

    useEffect(() => {
        api.expenses.getCategories().then(r => setCategorias(r.data || [])).catch(() => setCategorias([]));
    }, []);

    // Vista previa con la misma cuenta del servidor (facturaProveedor).
    const factura = useMemo(() => facturaProveedor([
        ...(detail.items || []).map(i => ({ base: parseFloat(i.subtotal) || 0, tasa: fiscal ? tasas[i.id] : 0 })),
        ...cargos.map(c => ({ base: (parseFloat(c.amount) || 0) / rate, tasa: fiscal ? c.iva_rate : 0 })),
    ], rate, fiscal ? parseFloat(ajuste) || 0 : 0), [detail.items, tasas, cargos, fiscal, ajuste, rate]);

    const setCargo = (i, k, v) => setCargos(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

    // Lo que espera el servidor (PATCH /purchases/:id/fiscal, o el alta con kind 'servicios').
    const payload = () => ({
        fiscal,
        supplier_rif: rif,
        supplier_invoice_number: numero,
        supplier_control_number: control,
        supplier_invoice_date: fecha,
        iva_adjust: fiscal ? parseFloat(ajuste) || 0 : 0,
        lines: (detail.items || []).map(i => ({ id: i.id, iva_rate: tasas[i.id] })),
        charges: cargos
            .filter(c => c.description.trim() || parseFloat(c.amount) > 0)
            .map(c => ({
                description: c.description,
                amount: (parseFloat(c.amount) || 0) / rate,
                iva_rate: c.iva_rate,
                expense_category_id: c.expense_category_id || null,
            })),
    });

    return {
        fiscal, setFiscal, rif, setRif, numero, setNumero, control, setControl, fecha, setFecha,
        tasas, setTasas, cargos, setCargos, setCargo, ajuste, setAjuste, categorias, factura, payload,
    };
}

// Los campos de la factura: tipo de documento, datos del papel, alícuota de cada producto, otros
// cargos (o las líneas de una factura de servicios) y el resumen. `rate` convierte el costo de
// cada producto (en base) a la moneda de la factura.
export function FacturaProveedorCampos({ f, items = [], rate = 1, sym, servicios = false, ivaEnabled = true }) {
    const lineaNueva = { description: "", amount: "", iva_rate: "16", expense_category_id: "" };
    return (
        <div className="space-y-5">
            {ivaEnabled && (
                <Segmented
                    className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center"
                    value={f.fiscal ? "si" : "no"}
                    onChange={k => f.setFiscal(k === "si")}
                    options={[{ key: "si", label: "Con factura fiscal" }, { key: "no", label: servicios ? "Sin factura" : "Nota de entrega" }]}
                />
            )}

            {f.fiscal ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="RIF del proveedor">
                        <input className={INPUT} value={f.rif} onChange={e => f.setRif(e.target.value.toUpperCase())} placeholder="J-12345678-9" />
                    </Field>
                    <Field label="Fecha de la factura">
                        <DatePicker value={f.fecha} onChange={v => v && f.setFecha(v)} clearable={false} className="w-full" />
                    </Field>
                    <Field label="N° de factura">
                        <input className={INPUT} value={f.numero} onChange={e => f.setNumero(e.target.value)} placeholder="00012345" />
                    </Field>
                    <Field label="N° de control">
                        <input className={INPUT} value={f.control} onChange={e => f.setControl(e.target.value)} placeholder="00-00012345" />
                    </Field>
                </div>
            ) : ivaEnabled ? (
                <p className="text-[13px] text-content-subtle">
                    {servicios
                        ? "Sin factura fiscal no lleva IVA ni entra al Libro de compras. Queda igual por pagar al proveedor."
                        : "Sin factura fiscal la compra no lleva IVA ni entra al Libro de compras. El inventario y lo que se le debe al proveedor quedan igual."}
                </p>
            ) : null}

            {f.fiscal && items.length > 0 && (
                <div>
                    <p className="text-[14px] font-semibold text-content dark:text-white">Alícuota de cada producto</p>
                    <p className="text-[12px] text-content-subtle mb-2">El costo va sin IVA. Cámbiala si el proveedor la facturó distinto.</p>
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                        {items.map(i => (
                            <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(i.product_name)}</p>
                                    <p className="text-[12px] text-content-subtle tabular-nums">{sym} {fmt2((parseFloat(i.subtotal) || 0) * rate)}</p>
                                </div>
                                <CustomSelect
                                    value={f.tasas[i.id]}
                                    onChange={v => f.setTasas(t => ({ ...t, [i.id]: v }))}
                                    options={OPCIONES_TASA}
                                    className="w-28 shrink-0"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <p className="text-[14px] font-semibold text-content dark:text-white">{servicios ? "Líneas de la factura" : "Otros cargos"}</p>
                <p className="text-[12px] text-content-subtle mb-2">
                    {servicios
                        ? "Cada renglón del papel, sin IVA, con su categoría de gasto."
                        : "Flete, transporte o un servicio de la misma factura: no entran al inventario."}
                </p>
                <div className="space-y-2">
                    {f.cargos.map((c, i) => (
                        <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center rounded-xl border border-border/70 dark:border-white/[0.08] p-2 sm:p-0 sm:border-0">
                            <input className={`${INPUT} sm:flex-1`} value={c.description} onChange={e => f.setCargo(i, "description", e.target.value)} placeholder={servicios ? "Mano de obra" : "Flete"} />
                            {/* En el teléfono la categoría baja a su propio renglón: los cuatro en una
                                fila no cabían en 390 px y la categoría quedaba en cero. */}
                            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                                <div className="relative w-32 shrink-0">
                                    <Prefijo>{sym}</Prefijo>
                                    <input className={`${INPUT} pl-11 tabular-nums`} inputMode="decimal" value={c.amount} onChange={e => f.setCargo(i, "amount", e.target.value.replace(",", "."))} placeholder="0.00" />
                                </div>
                                {f.fiscal && <CustomSelect value={c.iva_rate} onChange={v => f.setCargo(i, "iva_rate", v)} options={OPCIONES_TASA} className="w-24 shrink-0" />}
                                <CustomSelect
                                    value={c.expense_category_id}
                                    onChange={v => f.setCargo(i, "expense_category_id", v)}
                                    options={[{ value: "", label: "Sin categoría" }, ...f.categorias.map(k => ({ value: String(k.id), label: k.name }))]}
                                    className="order-last basis-full sm:order-none sm:basis-auto sm:w-40 min-w-0"
                                />
                                <button onClick={() => f.setCargos(cs => cs.filter((_, j) => j !== i))} className={`${QUITAR} ml-auto sm:ml-0`} title="Quitar línea" aria-label="Quitar línea">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => f.setCargos(cs => [...cs, lineaNueva])} className={AGREGAR}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                        {servicios ? "Agregar línea" : "Agregar cargo"}
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-4 py-3 space-y-1.5 text-[13px]">
                {f.fiscal ? renglonesIva(f.factura).map(r => (
                    <div key={r.label} className="flex justify-between gap-3 text-content-subtle">
                        <span>{r.label}</span><Money value={`${sym} ${fmt2(r.monto)}`} />
                    </div>
                )) : null}
                <div className={`flex justify-between items-baseline gap-3 ${f.fiscal ? "pt-2 border-t border-border/60 dark:border-white/[0.06]" : ""}`}>
                    <span className="text-[14px] font-semibold text-content dark:text-white">Total de la factura</span>
                    <Money value={`${sym} ${fmt2(f.factura.total)}`} className="text-[20px] font-bold tracking-tight text-content dark:text-white" />
                </div>
                {f.fiscal && (
                    <div className="pt-2 flex items-center justify-between gap-3">
                        <span className="text-[12px] text-content-subtle leading-snug">¿El IVA del papel difiere por céntimos? Corrígelo aquí.</span>
                        <div className="relative w-32 shrink-0">
                            <Prefijo>{sym}</Prefijo>
                            <input className={`${INPUT} pl-11 tabular-nums`} inputMode="decimal" value={f.ajuste} onChange={e => f.setAjuste(e.target.value.replace(",", "."))} placeholder="0.00" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function SupplierInvoiceModal({ detail, rate, sym, onClose, onSaved }) {
    const { notify, company } = useApp();
    const servicios = detail.kind === "servicios";
    const ivaEnabled = !!company?.iva_enabled;
    const f = useFacturaProveedor(detail, rate, { servicios, ivaEnabled });

    const guardar = async () => {
        try {
            const res = await api.purchases.setFiscal(detail.id, f.payload());
            notify(f.fiscal ? "Factura del proveedor guardada" : servicios ? "Factura guardada" : "Compra guardada sin factura fiscal");
            onSaved(res.data);
        } catch (e) {
            notify(e.message, "err");
        }
    };

    const pie = (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            <Button onClick={guardar} className="h-12 sm:h-10 px-5 text-[13px]">
                Guardar factura · {sym} {fmt2(f.factura.total)}
            </Button>
        </div>
    );

    return (
        <Modal open onClose={onClose} title={servicios ? "Factura de servicios" : "Factura del proveedor"} width={720} footer={pie}>
            <FacturaProveedorCampos f={f} items={detail.items || []} rate={rate} sym={sym} servicios={servicios} ivaEnabled={ivaEnabled} />
        </Modal>
    );
}
