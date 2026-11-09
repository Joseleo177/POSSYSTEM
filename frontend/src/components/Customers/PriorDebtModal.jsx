import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import Money from "../ui/Money";
import { Spinner } from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { useRatesOn } from "../../hooks/useRatesOn";
import { api } from "../../services/api";
import { fmtBase, todayISO, fmtDateShort } from "../../helpers";
import { monedaLocal } from "../../helpers/currency";

/**
 * Deuda anterior: lo que el cliente debía antes de usar el sistema (el cuaderno del fiado).
 *
 * Siempre queda en moneda base. Si se anotó en bolívares, se teclea en Bs y se convierte a la
 * tasa del DÍA de la deuda (historial de tasas), que se puede corregir; el monto en Bs y la
 * tasa quedan en la nota. No es una venta: no usa número de factura ni mueve inventario (ver
 * backend/src/services/customers/priorDebt.js).
 */
const num = (v) => parseFloat(String(v ?? "").replace(",", ".")) || 0;
const r2  = (n) => Math.round(n * 100) / 100;

export default function PriorDebtModal({ customer, open, onClose, onSuccess }) {
    const { notify, baseCurrency, activeCurrencies, sucursalesMarcadas = [], sucursalActual } = useApp();
    const moneda = monedaLocal(activeCurrencies);
    const sucursales = sucursalesMarcadas.filter(w => w.sells !== false);

    const vacio = () => ({
        en: "base",
        amount: "",
        rate: "",
        date: todayISO(),
        note: "",
        warehouse_id: String((sucursales.find(w => w.id === sucursalActual?.id) || sucursales[0])?.id || ""),
    });
    const [form, setForm] = useState(vacio);
    const [loading, setLoading] = useState(false);
    useEffect(() => { if (open) setForm(vacio()); }, [open]); // eslint-disable-line

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const fmt = (n) => fmtBase(n, baseCurrency);

    // Tasa del día de la deuda; si es hoy o no hay dato, la cargada en Monedas.
    const tasas    = useRatesOn(form.date);
    const tasaGuardada = moneda ? tasas.rateOf(moneda.id) : null;
    const tasaDia  = tasaGuardada || num(moneda?.exchange_rate);
    // El aviso mira solo la moneda local: useRatesOn da "sin dato" si CUALQUIER moneda (USDT,
    // pesos) no tiene tasa ese día, y aquí solo importa la del bolívar.
    const avisoTasa = tasas.status === "hoy" ? null
        : tasas.status === "cargando" ? { tono: "sutil", texto: "Buscando la tasa de ese día…" }
        : tasaGuardada ? { tono: "sutil", texto: `Se convierte a la tasa del ${fmtDateShort(form.date)}.` }
        : { tono: "aviso", texto: `No hay tasa guardada para el ${fmtDateShort(form.date)}: se usa la de hoy. Puedes corregirla abajo.` };
    const enLocal  = form.en === "local" && !!moneda;
    const tasa     = num(form.rate) || tasaDia;
    const monto    = num(form.amount);
    const montoBase = enLocal ? (tasa > 0 ? r2(monto / tasa) : 0) : r2(monto);

    const deudaHoy = num(customer?.total_debt);
    const listo = montoBase > 0 && form.date && form.warehouse_id && (!enLocal || tasa > 0);

    const submit = async () => {
        if (!listo || loading) return;
        const origen = enLocal ? `Anotada en ${moneda.symbol} ${monto.toFixed(2)} a ${tasa}` : "";
        const nota = [origen, form.note.trim()].filter(Boolean).join(" · ");
        setLoading(true);
        try {
            await api.customers.priorDebt(customer.id, {
                amount: montoBase,
                date: form.date,
                note: nota,
                warehouse_id: parseInt(form.warehouse_id),
            });
            notify(`Deuda anterior de ${fmt(montoBase)} cargada`);
            onSuccess?.();
            onClose();
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    };

    return (
        <Modal open={open} onClose={onClose} title="Deuda anterior" width={520}>
            {/* ── A quién y cómo queda ── */}
            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[12px] text-content-subtle">Cliente</p>
                    <p className="text-[15px] font-semibold text-content dark:text-white truncate">{customer?.name || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[12px] text-content-subtle">{montoBase > 0 ? "Quedará debiendo" : "Te debe hoy"}</p>
                    <Money value={fmt(deudaHoy + montoBase)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white leading-tight" />
                </div>
            </div>
            <p className="mt-2.5 text-[12px] text-content-subtle">
                Lo que debía antes del sistema. No usa número de factura ni mueve inventario, y se cobra como cualquier factura.
            </p>

            <div className="mt-5 space-y-4">
                {moneda && (
                    <Field label="Anotada en">
                        <Segmented
                            options={[
                                { key: "base",  label: baseCurrency?.symbol || "Ref." },
                                { key: "local", label: moneda.symbol || moneda.code },
                            ]}
                            value={form.en}
                            onChange={v => setForm(p => ({ ...p, en: v, rate: "" }))}
                        />
                    </Field>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Monto">
                        <div className="relative">
                            <Prefijo>{enLocal ? moneda.symbol : (baseCurrency?.symbol || "Ref.")}</Prefijo>
                            <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                data-autofocus
                                value={form.amount}
                                onChange={e => set("amount", e.target.value.replace(/[^\d.,]/g, ""))}
                                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                                placeholder="0.00"
                                className={`${INPUT} pl-11 text-[14px] font-semibold tabular-nums`}
                            />
                        </div>
                        {enLocal && montoBase > 0 && (
                            <p className="text-[12px] text-content-subtle tabular-nums mt-1">Equivale a {fmt(montoBase)}</p>
                        )}
                    </Field>
                    <Field label="Fecha de la deuda">
                        <DatePicker value={form.date} onChange={v => set("date", v > todayISO() ? todayISO() : v)} clearable={false} className="w-full" />
                        {enLocal && avisoTasa && (
                            <p className={`mt-1 text-[12px] ${avisoTasa.tono === "aviso" ? "text-warning" : "text-content-subtle"}`}>{avisoTasa.texto}</p>
                        )}
                    </Field>
                </div>

                {enLocal && (
                    <Field label="Tasa" hint="La de ese día">
                        <div className="relative">
                            <Prefijo>{moneda.symbol}</Prefijo>
                            <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={form.rate}
                                onChange={e => set("rate", e.target.value.replace(/[^\d.,]/g, ""))}
                                placeholder={tasaDia ? String(tasaDia) : "0.00"}
                                className={`${INPUT} pl-11 tabular-nums`}
                            />
                        </div>
                    </Field>
                )}

                {sucursales.length > 1 && (
                    <Field label="Sucursal" hint="Donde se le cobra">
                        <CustomSelect
                            value={form.warehouse_id}
                            onChange={v => set("warehouse_id", v)}
                            options={sucursales.map(w => ({ value: String(w.id), label: w.name }))}
                            placeholder="Elige la sucursal"
                        />
                    </Field>
                )}

                <Field label="Nota" hint="Opcional">
                    <input
                        type="text"
                        autoComplete="off"
                        maxLength={200}
                        value={form.note}
                        onChange={e => set("note", e.target.value)}
                        placeholder="Cuaderno, pág. 12"
                        className={INPUT}
                    />
                </Field>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={onClose} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">
                    Cancelar
                </button>
                <button onClick={submit} disabled={!listo || loading}
                    className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
                    {loading && <Spinner />}
                    {loading ? "Guardando…" : montoBase > 0 ? `Cargar ${fmt(montoBase)}` : "Cargar deuda"}
                </button>
            </div>
        </Modal>
    );
}

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

const Prefijo = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

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
