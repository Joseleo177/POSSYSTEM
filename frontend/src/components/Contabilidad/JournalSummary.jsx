import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { toNameCase } from "../../helpers";

// Tarjetas de cajas y bancos en Estado de Cuenta.
//
// El color propio de cada diario va solo en un punto junto al nombre: pintado en el saldo,
// un azul oscuro sobre el tema oscuro no se leía y cinco tarjetas de cinco colores competían
// entre sí. El saldo va en tinta; el rojo queda para un saldo negativo, que sí es una alerta.

const fmtNum = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Amount({ sym, n, sign = "", className = "" }) {
    return (
        <span className={`tabular-nums whitespace-nowrap ${className}`}>
            {sign}<span className="text-[0.62em] font-medium text-content-subtle mr-1">{sym}</span>{fmtNum(Math.abs(n))}
        </span>
    );
}

const ICON_BANCO = "M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18M12 3l9 5H3l9-5z";
const ICON_CAJA = "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z";

export default function JournalSummary({ dateFrom, dateTo, warehouseId, onData, onSelectJournal }) {
    const [data, setData] = useState([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const params = {};
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo)   params.date_to   = dateTo;
        if (warehouseId) params.warehouse_id = warehouseId;
        api.journals.getSummary(params).then(r => {
            setData(r.data);
            onData?.(r.data);
        }).catch(() => {}).finally(() => setLoaded(true));
    }, [dateFrom, dateTo, warehouseId, onData]);

    // ── Agrupar por banco + moneda + sucursal ──────────────────
    // Casi nunca el mismo banco es la misma cuenta en dos tiendas: "Banco de Venezuela" en la
    // sucursal A y en la B son dos cuentas reales distintas, y sumarlas de cabeza en una sola
    // tarjeta mostraba un saldo que no correspondía a ninguna de las dos. Un diario compartido
    // (warehouse_id null, la cuenta de toda la empresa) sigue agrupándose aparte, como su
    // propia "sucursal" para efectos de esta tarjeta.
    // La sucursal solo se muestra cuando de verdad hay varias: con una sola tienda es ruido.
    const multiWarehouse = new Set(
        data.filter(j => j.warehouse_id != null).map(j => j.warehouse_id)
    ).size > 1;

    const bankGroups = {};
    data.forEach(j => {
        // Journals sin banco → card individual por diario
        const key = j.bank_id
            ? `bank_${j.bank_id}_${j.currency_code ?? "base"}_${j.warehouse_id ?? "shared"}`
            : `journal_${j.id}`;
        if (!bankGroups[key]) {
            bankGroups[key] = {
                key,
                bank_id:       j.bank_id,
                warehouse_id:  j.bank_id ? (j.warehouse_id ?? null) : undefined,
                name:          j.bank_id ? (j.bank_name || j.name) : j.name,
                warehouse_name: multiWarehouse ? j.warehouse_name : null,
                journals:     [],
                total_ingresos: 0,
                ingresos_hoy:   0,
                tx_count:       0,
                currency_symbol: j.currency_symbol,
                currency_code:   j.currency_code,
                color: j.color || null,
            };
        }
        bankGroups[key].total_ingresos += parseFloat(j.total_ingresos || 0);
        bankGroups[key].ingresos_hoy   += parseFloat(j.ingresos_hoy   || 0);
        bankGroups[key].tx_count       += parseInt(j.tx_count         || 0);
        bankGroups[key].journals.push(j);
    });
    const groups = Object.values(bankGroups);

    // Total por moneda: no se suman bolívares con dólares.
    const porMoneda = [];
    groups.forEach(g => {
        const code = g.currency_code || "BASE";
        let t = porMoneda.find(x => x.code === code);
        if (!t) porMoneda.push(t = { code, sym: g.currency_symbol || "Ref.", total: 0, hoy: 0 });
        t.total += g.total_ingresos;
        t.hoy += g.ingresos_hoy;
    });

    const periodo = !!(dateFrom || dateTo);

    if (!groups.length) return loaded ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-8 h-8 mb-3 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ICON_BANCO} />
            </svg>
            <div className="text-[13px] font-semibold text-content dark:text-white">Sin cajas ni bancos</div>
            <div className="text-[12px] text-content-subtle mt-1">Crea un método de pago en Configuración para empezar.</div>
        </div>
    ) : null;

    return (
        <div className="space-y-5">
            {/* Totales por moneda */}
            {groups.length > 1 && (
                <div className="flex flex-wrap gap-x-10 gap-y-3 px-1">
                    {porMoneda.map(t => (
                        <div key={t.code} className="min-w-0">
                            <div className="text-[12px] text-content-subtle">
                                {periodo ? "Neto del período" : "Total"} en {t.code === "BASE" ? "moneda base" : t.code}
                            </div>
                            <Amount sym={t.sym} n={t.total} sign={t.total < 0 ? "−" : ""}
                                className={`block mt-1 text-[26px] leading-none font-bold tracking-tight ${t.total < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groups.map(group => {
                    const sym = group.currency_symbol || "Ref.";
                    const saldo = group.total_ingresos;
                    const hoy = group.ingresos_hoy;
                    const handleCardClick = () => {
                        // Con banco → vista de banco (todos sus diarios); sin banco → el diario.
                        if (group.bank_id) {
                            onSelectJournal?.({ bank_id: group.bank_id, warehouse_id: group.warehouse_id });
                        } else {
                            onSelectJournal?.(group.journals[0]);
                        }
                    };
                    // El efectivo también cuelga de un "banco" (EFECTIVO BS), así que el icono sale
                    // del tipo del diario y no de bank_id.
                    const esEfectivo = group.journals.every(j => j.type === "efectivo");
                    // Diario sin sucursal: la cuenta de toda la empresa. Con varias tiendas se dice.
                    const compartido = multiWarehouse && group.bank_id && group.warehouse_id === null;
                    const sub = group.journals.length > 1
                        ? `${group.journals.length} diarios`
                        : group.bank_id && group.journals[0]?.name !== group.name ? toNameCase(group.journals[0].name) : null;

                    return (
                        <button
                            key={group.key}
                            onClick={handleCardClick}
                            className="card-premium group text-left flex flex-col transition-shadow hover:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                        >
                            <div className="p-4 flex-1 w-full">
                                {/* Encabezado */}
                                <div className="flex items-start gap-3">
                                    <span className="w-9 h-9 rounded-xl bg-surface-2 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d={esEfectivo ? ICON_CAJA : ICON_BANCO} />
                                        </svg>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="w-2 h-2 rounded-full shrink-0 bg-content-subtle/40" style={group.color ? { backgroundColor: group.color } : undefined} />
                                            <h4 className="text-[14px] font-semibold tracking-tight text-content dark:text-white truncate">{toNameCase(group.name)}</h4>
                                        </div>
                                        <div className="text-[12px] text-content-subtle truncate mt-0.5">
                                            {[group.warehouse_name ? toNameCase(group.warehouse_name) : compartido ? "Toda la empresa" : null, sub].filter(Boolean).join(" · ") || (esEfectivo ? "Efectivo" : "Banco")}
                                        </div>
                                    </div>
                                    {group.currency_code && (
                                        <span className="text-[11px] font-medium text-content-subtle shrink-0 mt-0.5">{group.currency_code}</span>
                                    )}
                                </div>

                                {/* Saldo */}
                                <div className="mt-5">
                                    <div className="flex items-baseline justify-between gap-2 text-[12px] text-content-subtle">
                                        <span>{periodo ? "Neto del período" : "Saldo"}</span>
                                        <span className="tabular-nums">{group.tx_count} {group.tx_count === 1 ? "cobro" : "cobros"}</span>
                                    </div>
                                    <Amount sym={sym} n={saldo} sign={saldo < 0 ? "−" : ""}
                                        className={`block mt-1 text-[26px] leading-none font-bold tracking-tight ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                                </div>
                            </div>

                            {/* Pie: lo de hoy y el acceso al detalle, siempre visible (tablets). */}
                            <div className="w-full px-4 py-3 border-t border-border/60 dark:border-white/[0.06] flex items-center gap-3 text-[12px]">
                                <div className="min-w-0 flex-1 truncate">
                                    <span className="text-content-subtle">Hoy </span>
                                    {Math.abs(hoy) < 0.005 ? (
                                        <span className="text-content-subtle">sin movimiento</span>
                                    ) : (
                                        <Amount sym={sym} n={hoy} sign={hoy > 0 ? "+" : "−"}
                                            className={`text-[13px] font-semibold ${hoy > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`} />
                                    )}
                                </div>
                                <span className="shrink-0 inline-flex items-center gap-1 font-medium text-content-muted dark:text-white/60 group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors">
                                    Ver movimientos
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
