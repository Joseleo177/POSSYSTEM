import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useCart } from "../../context/CartContext";
import { fmtMoney, toNameCase } from "../../helpers";
import { monedaLocal, saleTotalAtRate } from "../../helpers/currency";
import { Spinner } from "../ui/Spinner";
import ClienteMesa from "./ClienteMesa";
import SaleConfirmModal from "../cobro/SaleConfirmModal";

const Svg = ({ d, className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);

const Icono = {
    atras: "M15 19l-7-7 7-7",
    x: "M6 18L18 6M6 6l12 12",
    persona: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    check: "M5 13l4 4L19 7",
    plato: "M3 13h18M5 13a7 7 0 0114 0M12 6V4m-7 13h14",
};

const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};

const montoDe = it => parseFloat(it.subtotal ?? (parseFloat(it.price) * parseFloat(it.quantity))) || 0;

/**
 * Agrupa los platos y sus adicionales correspondientes
 */
function agruparPlatos(items) {
    const platos = [];
    for (const it of items || []) {
        const m = montoDe(it);
        if (it.is_addon && platos.length) {
            platos[platos.length - 1].extras.push(it);
            platos[platos.length - 1].montoTotal += m;
            continue;
        }
        platos.push({
            ...it,
            montoTotal: m,
            extras: [],
        });
    }
    return platos;
}

/**
 * Hoja de cobro propia de la mesa:
 * - Selección de qué se paga: "Toda la mesa" o puestos específicos ("P1", "P2").
 * - Cliente para la factura (con atajo para cambiarlo o registrarlo).
 * - Servicio sugerido / propina (10%, etc.).
 * - Montos en Ref. y en Bs. calculados con la tasa del día.
 * - Conecta directamente con la botonera de pago fiscal (SaleConfirmModal).
 */
export default function CobroMesa({
    table,
    cuenta,
    sym = "Ref.",
    notify,
    onClose,
    onDone,
}) {
    const { activeCurrencies, baseCurrency, currentCurrency, settings, company, activeWarehouse, mySeries, selectedSerieId, loadMySeries } = useApp();
    const {
        cart,
        heldSaleId,
        takeHeldCart,
        holdCart,
        selectedCustomer,
        setSelectedCustomer,
        setChargeEnabled,
        setChargeLabel,
        setChargeMode,
        setChargeFromPct,
        checkout,
        receipt,
        setReceipt,
    } = useCart();

    const [modoCobro, setModoCobro] = useState("todo"); // "todo" | "puestos"
    const [puestosSel, setPuestosSel] = useState([]);    // [seat1, seat2]
    const [cliente, setCliente] = useState(() => cuenta?.customer || selectedCustomer || null);
    const [showPickerCliente, setShowPickerCliente] = useState(false);
    const [servicePct, setServicePct] = useState(0);
    const [procesando, setProcesando] = useState(false);
    const [saleBalance, setSaleBalance] = useState(null);
    // El cobro va en pasos porque cada uno necesita el carrito ya actualizado por el anterior:
    // las funciones del contexto que se tienen en este render ven el carrito de ANTES de
    // takeHeldCart (vacío), y llamar a checkout ahí mismo daba "El carrito está vacío".
    //   recargo  → con la cuenta ya en el carrito, el % se calcula sobre su consumo real.
    //   facturar → con el recargo ya puesto, se factura.
    const [fase, setFase] = useState(null); // { id, paso: "recargo" | "facturar" }

    // Moneda local y tasa del día
    const local = monedaLocal(activeCurrencies);
    const tasaLocal = parseFloat(local?.exchange_rate) || 0;
    const localSym = local?.symbol || "Bs.";
    // En Bs se convierte como la factura (saleTotalAtRate, espejo del servidor): línea por
    // línea y el recargo aparte, cada uno redondeado. Convertir el total de una vez daba un
    // céntimo distinto del que luego pedía el cobro (3021,97 aquí, 3021,96 en la botonera).
    const enBs = (n, items, recargo = 0, descuento = 0) => {
        if (!local || !(tasaLocal > 0)) return null;
        const bs = items?.length
            ? saleTotalAtRate({ items, total: n, service_charge: recargo, discount_amount: descuento }, tasaLocal)
            : (parseFloat(n) || 0) * tasaLocal;
        return fmtMoney(bs, localSym);
    };

    // Asegurar series para facturar
    useEffect(() => {
        if (activeWarehouse?.id && (!mySeries || mySeries.length === 0)) {
            loadMySeries(activeWarehouse.id);
        }
    }, [activeWarehouse?.id, mySeries, loadMySeries]);

    // Platos agrupados
    const platos = useMemo(() => agruparPlatos(cuenta?.items), [cuenta?.items]);

    // Puestos presentes en la cuenta
    const puestosMap = useMemo(() => {
        const m = new Map();
        for (const p of platos) {
            const k = p.seat || null;
            if (!m.has(k)) m.set(k, { seat: k, platos: [], total: 0 });
            const g = m.get(k);
            g.platos.push(p);
            g.total += p.montoTotal;
        }
        return [...m.values()].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    }, [platos]);

    const tieneVariosPuestos = puestosMap.length > 1 || (puestosMap.length === 1 && puestosMap[0].seat !== null);

    // Inicializar puestos seleccionados
    useEffect(() => {
        if (puestosMap.length > 0 && puestosSel.length === 0) {
            setPuestosSel(puestosMap.map(g => g.seat));
        }
    }, [puestosMap]);

    const alternarPuesto = (s) => {
        setPuestosSel(prev => {
            if (prev.includes(s)) {
                if (prev.length <= 1) return prev; // Al menos uno seleccionado
                return prev.filter(x => x !== s);
            }
            return [...prev, s];
        });
    };

    // Platos que se pagan en esta factura
    const platosAPagar = useMemo(() => {
        if (modoCobro === "todo" || !tieneVariosPuestos) return platos;
        return platos.filter(p => puestosSel.includes(p.seat));
    }, [platos, modoCobro, tieneVariosPuestos, puestosSel]);

    // Subtotal consumo
    const subtotalConsumo = useMemo(() => {
        return platosAPagar.reduce((sum, p) => sum + p.montoTotal, 0);
    }, [platosAPagar]);

    // Servicio / Propina
    const montoServicio = useMemo(() => {
        return servicePct > 0 ? Math.round(subtotalConsumo * (servicePct / 100) * 100) / 100 : 0;
    }, [subtotalConsumo, servicePct]);

    const totalFactura = subtotalConsumo + montoServicio;

    // Las líneas tal como las guarda la factura (plato y sus adicionales), para convertir a Bs.
    const lineasAPagar = useMemo(() => platosAPagar.flatMap(p => [p, ...p.extras]), [platosAPagar]);

    // Ejecutar el cobro (paso 1): separar si hace falta, traer la cuenta al carrito, el cliente.
    const procederAlCobro = async () => {
        if (procesando) return;
        if (!platosAPagar.length) return notify("No hay platos seleccionados para cobrar", "err");

        setProcesando(true);
        try {
            let saleIdCobro = cuenta.id;
            const esParcial = modoCobro === "puestos" && tieneVariosPuestos && platosAPagar.length < platos.length;

            if (esParcial) {
                // Separar los platos seleccionados a una nueva cuenta
                const itemsSeparar = [];
                for (const p of platosAPagar) {
                    itemsSeparar.push({ id: p.id, qty: parseFloat(p.quantity) });
                    for (const x of p.extras) {
                        itemsSeparar.push({ id: x.id, qty: parseFloat(x.quantity) });
                    }
                }
                const resSplit = await api.tables.splitAccount(cuenta.id, itemsSeparar);
                const nuevoId = resSplit.data?.new_sale_id;
                if (!nuevoId) throw new Error("No se pudo separar la cuenta de los puestos");
                saleIdCobro = nuevoId;
            }

            // Tomar la cuenta en el carrito de la caja. Si no llega (otra caja la tiene, es de
            // otra sucursal), takeHeldCart ya avisó.
            const ok = await takeHeldCart(saleIdCobro);
            if (ok !== true) { setProcesando(false); return; }

            // Asignar cliente (o general)
            if (cliente) {
                setSelectedCustomer(cliente);
            } else if (!selectedCustomer) {
                // Si no hay cliente, buscar el Cliente General por defecto
                try {
                    const r = await api.tables.findCustomers("general");
                    const general = r.data?.[0];
                    if (general) setSelectedCustomer(general);
                } catch { /* ignora */ }
            }

            // El recargo va como monto (el % se convierte a monto en el paso siguiente, ya con
            // el consumo de esta cuenta en el carrito).
            setChargeMode("amount");
            if (servicePct > 0) {
                setChargeEnabled(true);
                setChargeLabel("Servicio");
            } else {
                setChargeEnabled(false);
            }
            setFase({ id: saleIdCobro, paso: "recargo" });
        } catch (err) {
            notify(err.message || "Error al iniciar el cobro", "err");
            setProcesando(false);
        }
    };

    // Pasos 2 y 3: corren cuando el carrito ya tiene la cuenta (render siguiente al anterior).
    useEffect(() => {
        if (!fase || heldSaleId !== fase.id) return;
        if (!cart.length) {
            setFase(null);
            setProcesando(false);
            notify("La cuenta no trajo productos para cobrar", "err");
            return;
        }
        if (fase.paso === "recargo") {
            if (servicePct > 0) setChargeFromPct(servicePct);
            setFase({ id: fase.id, paso: "facturar" });
            return;
        }
        // facturar: si falta algo (serie, turno), checkout avisa y la hoja sigue abierta.
        setFase(null);
        Promise.resolve(checkout()).finally(() => setProcesando(false));
    }, [fase, heldSaleId, cart, servicePct, setChargeFromPct, checkout, notify]);

    // Salir sin cobrar: si la cuenta ya se trajo al carrito (un cobro que no llegó a facturar),
    // vuelve a quedar en espera. Si no, la caja se quedaría con la mesa tomada.
    const cerrar = async () => {
        if (procesando) return;
        if (heldSaleId && cart.length > 0) {
            try { await holdCart(); } catch { /* ignora */ }
        }
        onClose();
    };

    // Si ya hay receipt, mostramos la botonera de pago estándar (SaleConfirmModal), con los
    // mismos manejadores que la caja (CobroPage). Antes onPay no hacía nada: el modal seguía
    // diciendo "Borrador · Sin cobrar" con la factura ya pagada, y al salir intentaba
    // emitirla a crédito.
    if (receipt) {
        return (
            <SaleConfirmModal
                receipt={receipt}
                saleBalance={saleBalance}
                baseCurrency={baseCurrency}
                currentCurrency={currentCurrency}
                onNext={() => {
                    setReceipt(null);
                    setSaleBalance(null);
                    onDone(true);
                }}
                onPay={(res) => {
                    // Los pagos se acumulan: un cobro mixto son varias llamadas y el ticket
                    // tiene que listarlos todos (igual que CobroPage).
                    setSaleBalance(prev => ({
                        amount_paid: res.amount_paid,
                        balance: res.balance,
                        status: res.sale_status,
                        payments: [
                            ...(prev?.payments || []),
                            ...(res.payments?.length ? res.payments : [res.data]),
                        ].filter(Boolean),
                        credit_applied: (prev?.credit_applied || 0) + parseFloat(res.credit_applied || 0),
                    }));
                    if (res.invoice_number) setReceipt(prev => ({ ...prev, invoice_number: res.invoice_number }));
                }}
                onUndo={async () => {
                    setReceipt(null);
                    setSaleBalance(null);
                    onDone(true);
                }}
                onRefresh={(data) => setReceipt(prev => (prev ? { ...prev, ...data } : prev))}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-[180] bg-surface-2 dark:bg-surface-dark flex flex-col modal-in">
            {/* Cabecera */}
            <header className="shrink-0 h-16 px-4 flex items-center justify-between bg-white dark:bg-surface-dark-2 border-b border-border/40 dark:border-white/[0.06]">
                <div className="flex items-center gap-3 min-w-0">
                    <button type="button" onClick={cerrar} disabled={procesando} aria-label="Volver a la mesa"
                        className="w-11 h-11 shrink-0 rounded-xl btn-outline flex items-center justify-center">
                        <Svg d={Icono.atras} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-[18px] font-bold tracking-tight text-content dark:text-white leading-tight truncate">
                            Cobrar · {table?.name || "Mesa"}
                        </h2>
                        <p className="text-[12px] text-content-subtle truncate tabular-nums">
                            Cuenta de {fmtMoney(cuenta.total, sym)}
                            {enBs(cuenta.total, cuenta.items, cuenta.service_charge, cuenta.discount_amount) && ` · ${enBs(cuenta.total, cuenta.items, cuenta.service_charge, cuenta.discount_amount)}`}
                        </p>
                    </div>
                </div>
                <button type="button" onClick={cerrar} aria-label="Cerrar"
                    className="w-10 h-10 rounded-lg btn-outline flex items-center justify-center">
                    <Svg d={Icono.x} />
                </button>
            </header>

            {/* Contenido principal */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5">
                {/* 1. Selección de puestos a pagar */}
                {tieneVariosPuestos && (
                    <section className="bg-white dark:bg-surface-dark-2 rounded-2xl p-4 sm:p-5 border border-border/60 dark:border-white/[0.06] shadow-card">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[15px] font-bold text-content dark:text-white">¿Qué van a pagar ahora?</h3>
                            <span className="text-[12px] text-content-subtle">
                                {modoCobro === "todo" ? "Toda la mesa junta" : `${puestosSel.length} ${puestosSel.length === 1 ? "puesto" : "puestos"}`}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <button type="button" onClick={() => setModoCobro("todo")}
                                className={`h-11 rounded-xl text-[13px] font-semibold border transition-all ${modoCobro === "todo"
                                    ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/20"
                                    : "border-border dark:border-white/10 text-content dark:text-white"}`}>
                                Toda la mesa ({fmtMoney(cuenta.total, sym)})
                            </button>
                            <button type="button" onClick={() => setModoCobro("puestos")}
                                className={`h-11 rounded-xl text-[13px] font-semibold border transition-all ${modoCobro === "puestos"
                                    ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/20"
                                    : "border-border dark:border-white/10 text-content dark:text-white"}`}>
                                Separar por puestos
                            </button>
                        </div>

                        {modoCobro === "puestos" && (
                            <div className="pt-2 border-t border-border/40 dark:border-white/[0.04]">
                                <div className="text-[12px] text-content-subtle mb-2">Toca los puestos que pagan en esta cuenta:</div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {puestosMap.map(g => {
                                        const on = puestosSel.includes(g.seat);
                                        return (
                                            <button key={g.seat ?? "mesa"} type="button" onClick={() => alternarPuesto(g.seat)}
                                                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${on
                                                    ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/20"
                                                    : "border-border dark:border-white/10 opacity-70"}`}>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[13px] font-bold ${on ? "text-brand-700 dark:text-brand-300" : "text-content dark:text-white"}`}>
                                                        {g.seat ? `Puesto ${g.seat}` : "Mesa (compartido)"}
                                                    </span>
                                                    {on && <Svg d={Icono.check} className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
                                                </div>
                                                <div className="mt-1 text-[13px] font-semibold tabular-nums text-content dark:text-white">
                                                    {fmtMoney(g.total, sym)}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* 2. Cliente para la factura */}
                <section className="bg-white dark:bg-surface-dark-2 rounded-2xl p-4 sm:p-5 border border-border/60 dark:border-white/[0.06] shadow-card">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[15px] font-bold text-content dark:text-white">Cliente de la factura</h3>
                        <button type="button" onClick={() => setShowPickerCliente(true)}
                            className="text-[12px] font-semibold text-brand-600 dark:text-brand-400">
                            {cliente ? "Cambiar" : "Asignar"}
                        </button>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 dark:bg-white/[0.04]">
                        <span className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.08] flex items-center justify-center text-content-subtle shrink-0">
                            <Svg d={Icono.persona} className="w-5 h-5" />
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-bold text-content dark:text-white truncate">
                                {cliente ? toNameCase(cliente.name) : "Cliente General"}
                            </div>
                            <div className="text-[12px] text-content-subtle truncate tabular-nums">
                                {cliente ? (cliente.rif || "Sin cédula registrada") : "Consumidor final sin datos fiscales"}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. Servicio sugerido / Propina */}
                <section className="bg-white dark:bg-surface-dark-2 rounded-2xl p-4 sm:p-5 border border-border/60 dark:border-white/[0.06] shadow-card">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[15px] font-bold text-content dark:text-white">Servicio sugerido</h3>
                        <span className="text-[13px] font-semibold tabular-nums text-content dark:text-white">
                            {servicePct > 0 ? `${fmtMoney(montoServicio, sym)} (${servicePct}%)` : "Sin servicio"}
                        </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                        {[0, 10, 15, 20].map(pct => {
                            const on = servicePct === pct;
                            return (
                                <button key={pct} type="button" onClick={() => setServicePct(pct)}
                                    className={`h-11 rounded-xl text-[13px] font-semibold border transition-all ${on
                                        ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-2 ring-brand-500/20"
                                        : "border-border dark:border-white/10 text-content dark:text-white"}`}>
                                    {pct === 0 ? "0%" : `${pct}%`}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* 4. Resumen y Total */}
                <section className="rounded-2xl p-5 border border-brand-500/30 bg-brand-500/[0.03] space-y-2.5">
                    <div className="flex justify-between items-center text-[13px] text-content-subtle">
                        <span>Consumo ({platosAPagar.length} {platosAPagar.length === 1 ? "plato" : "platos"}):</span>
                        <span className="font-semibold tabular-nums text-content dark:text-white">{fmtMoney(subtotalConsumo, sym)}</span>
                    </div>

                    {servicePct > 0 && (
                        <div className="flex justify-between items-center text-[13px] text-content-subtle">
                            <span>Servicio ({servicePct}%):</span>
                            <span className="font-semibold tabular-nums text-content dark:text-white">{fmtMoney(montoServicio, sym)}</span>
                        </div>
                    )}

                    <div className="pt-2 border-t border-border/60 dark:border-white/[0.08] flex items-baseline justify-between">
                        <span className="text-[15px] font-bold text-content dark:text-white">Total a pagar:</span>
                        <div className="text-right">
                            <span className="text-[26px] font-extrabold tracking-tight tabular-nums text-content dark:text-white leading-none block">
                                {fmtMoney(totalFactura, sym)}
                            </span>
                            {enBs(totalFactura, lineasAPagar, montoServicio) && (
                                <span className="text-[13px] text-content-subtle tabular-nums mt-0.5 block">
                                    {enBs(totalFactura, lineasAPagar, montoServicio)}
                                </span>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* Barra inferior de acción */}
            <div className="shrink-0 p-4 bg-white dark:bg-surface-dark-2 border-t border-border/40 dark:border-white/[0.06] flex items-center justify-end gap-3 max-w-2xl mx-auto w-full">
                <button type="button" onClick={cerrar} disabled={procesando}
                    className="btn-outline h-12 px-5 rounded-xl text-[14px] font-semibold">
                    Cancelar
                </button>
                <button type="button" onClick={procederAlCobro} disabled={procesando || !platosAPagar.length}
                    className="btn-accent flex-1 h-12 rounded-xl text-[15px] font-bold inline-flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60">
                    {procesando && <Spinner />}
                    {procesando ? "Preparando cobro…" : `Cobrar · ${fmtMoney(totalFactura, sym)}`}
                </button>
            </div>

            {/* Modal para cambiar/asignar cliente */}
            {showPickerCliente && (
                <ClienteMesa
                    value={cliente}
                    onPick={(c) => {
                        setCliente(c);
                        setShowPickerCliente(false);
                    }}
                    onClose={() => setShowPickerCliente(false)}
                    notify={notify}
                />
            )}
        </div>
    );
}
