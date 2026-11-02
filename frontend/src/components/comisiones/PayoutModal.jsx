import { useEffect, useState } from "react";
import { Spinner } from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import CustomSelect from "../ui/CustomSelect";
import JournalPickerButton from "../cobro/JournalPickerButton";
import RateField, { resolveRate } from "../ui/RateField";
import Money from "../ui/Money";
import { todayISO, journalsForWarehouse, toNameCase } from "../../helpers";

const getEmpty = () => ({
    received_amount: "", exchange_rate: "", date: todayISO(), reference: "", notes: "",
    payment_journal_id: "", payment_method: "", pay_currency_id: "",
});

/**
 * Liquidar comisiones a un vendedor: sale un egreso (categoría "Comisiones a vendedores") de la
 * caja o banco elegido. Mismo flujo que pagar a un proveedor. El saldo va en moneda base; el
 * pago puede salir en otra moneda a su tasa.
 *
 *   seller  – { id, name, code, saldo }   (null = cerrado)
 */
export default function PayoutModal({ seller, onClose, onPaid }) {
    const { notify, baseCurrency, activeCurrencies, outflowJournals: todas, sucursalActual, sucursales = [] } = useApp();
    const [form, setForm] = useState(getEmpty);
    const [loading, setLoading] = useState(false);
    // El egreso pertenece a una sucursal (su arqueo). La de trabajo, o la primera que atiende.
    const vendedoras = sucursales.filter(w => w.sells !== false);
    const [warehouseId, setWarehouseId] = useState(null);
    useEffect(() => {
        if (!seller) return;
        setForm(getEmpty());
        setWarehouseId(sucursalActual?.sells !== false && sucursalActual?.id ? sucursalActual.id : vendedoras[0]?.id ?? null);
    }, [seller]); // eslint-disable-line react-hooks/exhaustive-deps

    const outflowJournals = journalsForWarehouse(todas, warehouseId);
    const saldo = Math.max(0, parseFloat(seller?.saldo || 0));
    const sym = baseCurrency?.symbol || "Ref.";

    const payCur     = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
    const payCurRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
    const payRate    = (!payCur || payCur.is_base) ? 1 : resolveRate(form.exchange_rate, payCurRate);
    const paySym     = payCur?.symbol || sym;

    const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
    const amountBase  = !isNaN(receivedNum) && receivedNum > 0 ? parseFloat((receivedNum / payRate).toFixed(5)) : 0;
    const pasa        = amountBase > saldo + 0.01;
    const queda       = Math.max(0, saldo - amountBase);
    const isCash      = outflowJournals.find(j => j.id === form.payment_journal_id)?.type === "efectivo";
    const fmtRef      = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;

    const canSubmit = !loading && form.payment_journal_id && amountBase > 0 && !pasa && warehouseId && form.date;

    const submit = async () => {
        setLoading(true);
        try {
            const r = await api.commissions.pay(seller.id, {
                amount: amountBase,
                currency_id: payCur?.id || null,
                exchange_rate: payRate,
                payment_journal_id: parseInt(form.payment_journal_id),
                payment_method: form.payment_method || null,
                warehouse_id: warehouseId,
                date: form.date,
                reference: form.reference.trim() || null,
                notes: form.notes.trim() || null,
            });
            notify(r.data?.balance > 0.005 ? `Liquidado. Queda por pagar ${fmtRef(r.data.balance)}` : "Comisiones liquidadas");
            onPaid?.(r.data);
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    };

    const montoBoton = receivedNum > 0 ? `${paySym} ${receivedNum.toFixed(2)}` : "";

    return (
        <Modal open={!!seller} onClose={onClose} title="Liquidar comisiones" width={760}>
            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[12px] text-content-subtle">Vendedor</p>
                    <p className="text-[15px] font-semibold text-content dark:text-white truncate">{toNameCase(seller?.name)} <span className="font-normal text-content-subtle">· {seller?.code}</span></p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[12px] text-content-subtle">Por liquidar</p>
                    <Money value={fmtRef(saldo)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white leading-tight" />
                </div>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0 space-y-4">
                    {vendedoras.length > 1 && (
                        <Field label="Sucursal del egreso">
                            <CustomSelect value={warehouseId ? String(warehouseId) : ""}
                                onChange={v => { setWarehouseId(parseInt(v)); setForm(p => ({ ...p, payment_journal_id: "", payment_method: "", pay_currency_id: "" })); }}
                                options={vendedoras.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))} className="w-full" boxClassName="rounded-lg" />
                        </Field>
                    )}

                    <Field label="De qué caja sale">
                        <JournalPickerButton
                            value={form.payment_journal_id}
                            journals={outflowJournals}
                            outflowOnly
                            placeholder="Elegir caja o banco…"
                            boxClassName="rounded-lg"
                            methodPrompt={{ tag: "Comisiones", title: "¿De qué caja sale el pago?" }}
                            onSelect={(j) => {
                                const curId = j.currency_id || baseCurrency?.id;
                                const cur   = activeCurrencies.find(c => c.id === parseInt(curId));
                                const rate  = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
                                setForm(p => ({
                                    ...p,
                                    payment_journal_id: j.id,
                                    payment_method: j.payment_method || "",
                                    pay_currency_id: curId || p.pay_currency_id,
                                    exchange_rate: "",
                                    received_amount: (saldo * rate).toFixed(2),
                                }));
                            }}
                        />
                    </Field>

                    {payCur && !payCur.is_base && (
                        <Field label="Tasa de cambio">
                            <RateField
                                value={form.exchange_rate}
                                configuredRate={payCurRate}
                                currency={payCur}
                                onChange={(v) => {
                                    const nextRate = resolveRate(v, payCurRate);
                                    const propuesto = (saldo * payRate).toFixed(2);
                                    setForm(p => ({
                                        ...p, exchange_rate: v,
                                        received_amount: p.received_amount === propuesto ? (saldo * nextRate).toFixed(2) : p.received_amount,
                                    }));
                                }}
                            />
                        </Field>
                    )}

                    <div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Monto">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{paySym}</span>
                                    <input type="text" inputMode="decimal" autoComplete="off" value={form.received_amount}
                                        onChange={e => setForm(p => ({ ...p, received_amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                                        placeholder="0.00" className={`${INPUT} pl-11 text-[14px] font-semibold tabular-nums`} />
                                </div>
                            </Field>
                            <Field label="Fecha del pago">
                                <DatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} clearable={false} className="w-full" />
                            </Field>
                        </div>
                        {payCur && !payCur.is_base && amountBase > 0 && (
                            <p className="text-[12px] text-content-subtle tabular-nums mt-1">≈ {fmtRef(amountBase)} · tasa {payRate}</p>
                        )}
                        {pasa && <p className="text-[12px] font-medium text-red-600 dark:text-red-400 mt-1">Pasa de lo que se le debe ({fmtRef(saldo)}).</p>}
                    </div>

                    {!isCash && (
                        <Field label="N° de referencia" hint="Opcional">
                            <input type="text" autoComplete="off" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} placeholder="Ej: 000123456" className={INPUT} />
                        </Field>
                    )}
                    <Field label="Notas" hint="Opcional">
                        <input type="text" autoComplete="off" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Ej: quincena del 1 al 15" className={INPUT} />
                    </Field>
                </div>

                <aside className="min-w-0 lg:border-l lg:border-border/60 dark:lg:border-white/[0.06] lg:pl-6">
                    <p className="text-[13px] font-semibold text-content dark:text-white">Cómo queda</p>
                    <p className="text-[12px] text-content-subtle mb-2">Lo que se le debe después de este pago</p>
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3 space-y-1.5 text-[13px]">
                        <Linea label="Por liquidar" value={fmtRef(saldo)} />
                        <Linea label="Este pago" value={amountBase > 0 ? fmtRef(amountBase) : "—"} />
                        <div className="pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06] flex items-baseline justify-between gap-3">
                            {amountBase > 0 && queda <= 0.01 && !pasa ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Queda al día
                                </span>
                            ) : (
                                <>
                                    <span className="text-content-subtle">Queda por liquidar</span>
                                    <Money value={fmtRef(queda)} className="text-[15px] font-semibold text-content dark:text-white" />
                                </>
                            )}
                        </div>
                    </div>
                    <p className="text-[12px] text-content-subtle mt-3 leading-relaxed">El pago sale como egreso en Contabilidad. Anularlo allá deshace la liquidación.</p>
                </aside>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={onClose} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                <button onClick={submit} disabled={!canSubmit}
                    className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
                    {loading && <Spinner />}
                    {loading ? "Registrando…" : montoBoton ? `Pagar ${montoBoton}` : "Liquidar"}
                </button>
            </div>
        </Modal>
    );
}

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

function Linea({ label, value }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-content-subtle">{label}</span>
            <Money value={value} className="font-medium text-content dark:text-white" />
        </div>
    );
}
