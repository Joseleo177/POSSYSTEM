import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Money from "../ui/Money";
import BulkPaymentModal from "../Customers/BulkPaymentModal";
import DejarBolsaModal from "./DejarBolsaModal";
import DarRegaloModal from "./DarRegaloModal";
import RegaloFila from "./RegaloFila";
import { ICON } from "../warehouses/movementMeta";
import { fmtDateShort, toNameCase } from "../../helpers";
import { fmtBaseCon, fmtLocalCon } from "./shared";

const IconoRegalo = () => (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICON.gift} />
    </svg>
);

/**
 * Ficha del cliente en la ruta: lo que debe, las dos cosas que hace el cobrador (abonar y dejar
 * mercancía) y el historial, que es la tarjeta de papel: cada bolsa y cada abono, con fecha.
 *
 * El abono usa el mismo modal del cobro conjunto de toda la app: imputa de la factura más vieja
 * a la más nueva, toma la tasa del día del pago y declara el vuelto. Solo cambia por dónde se
 * manda (la ruta de cobranza comprueba que el cliente sea del sector de quien cobra).
 */
export default function FichaCliente({ id, onChanged }) {
    const { notify, can, baseCurrency, activeCurrencies } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const fmtLocal = fmtLocalCon(activeCurrencies);
    const puedeAbonar = can("cobranza.collect");
    const puedeDejar = can("cobranza.leave");
    const puedeRegalar = can("cobranza.gifts");

    const [ficha, setFicha] = useState(null);
    const [tick, setTick] = useState(0);
    const [abonando, setAbonando] = useState(false);
    const [dejando, setDejando] = useState(false);
    const [regalando, setRegalando] = useState(null);   // null cerrado · { bolsa } abierto

    useEffect(() => {
        let vivo = true;
        api.cobranza.ficha(id)
            .then(r => { if (vivo) setFicha(r.data); })
            .catch(e => { if (vivo) notify(e.message, "err"); });
        return () => { vivo = false; };
    }, [id, tick]);   // eslint-disable-line react-hooks/exhaustive-deps

    const despues = () => { setTick(t => t + 1); onChanged?.(); };

    if (!ficha) {
        return (
            <div className="p-5 space-y-3">
                <div className="h-6 w-2/3 rounded bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                <div className="h-24 rounded-2xl bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                <div className="h-40 rounded-2xl bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
            </div>
        );
    }

    const { cliente, deuda, facturas, historial, bolsa, regalos = [], ganados = [], regalos_activos } = ficha;
    const regalosVivos = regalos.filter(r => r.status !== "anulado");
    const debe = deuda > 0.004;

    return (
        <>
        <div className="p-4 lg:p-5 space-y-4">
            {/* Cliente */}
            <div>
                <h2 className="text-[20px] font-semibold text-content dark:text-white leading-tight">{toNameCase(cliente.name)}</h2>
                <p className="mt-1 text-[13px] text-content-subtle">
                    {cliente.rif}{cliente.sector_name ? ` · ${cliente.sector_name}` : " · Sin sector"}
                </p>
                {(cliente.address || cliente.phone) && (
                    <div className="mt-2 space-y-1 text-[13px] text-content dark:text-white/80">
                        {cliente.address && <p>{cliente.address}</p>}
                        {cliente.phone && (
                            <a href={`tel:${cliente.phone}`} className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-300 font-medium">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h2.3a1 1 0 01.95.68l1.1 3.3a1 1 0 01-.5 1.2l-1.6.8a11 11 0 005.2 5.2l.8-1.6a1 1 0 011.2-.5l3.3 1.1a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z" /></svg>
                                {cliente.phone}
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Lo que debe */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
                <p className="text-[12px] text-content-subtle">{debe ? "Debe" : "Saldo"}</p>
                {debe ? (
                    <>
                        <Money value={fmtBase(deuda)} className="block text-[26px] font-bold tracking-tight text-red-600 dark:text-red-400" />
                        {fmtLocal && <p className="text-[12px] text-content-subtle tabular-nums">{fmtLocal(deuda)} a la tasa de hoy</p>}
                        <p className="mt-1 text-[12px] text-content-subtle">
                            {facturas.length} {facturas.length === 1 ? "factura abierta" : "facturas abiertas"}
                            {facturas[0] && <> · desde el {fmtDateShort(facturas[0].created_at)}</>}
                        </p>
                    </>
                ) : (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
                        Al día
                    </p>
                )}

                {(puedeAbonar || puedeDejar) && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        {puedeAbonar && debe && (
                            <button type="button" onClick={() => setAbonando(true)}
                                className="btn-accent h-12 sm:h-10 sm:flex-1 rounded-lg text-[14px] sm:text-[13px] font-semibold active:scale-[0.99]">
                                Abonar
                            </button>
                        )}
                        {puedeDejar && (
                            <button type="button" onClick={() => setDejando(true)} disabled={!bolsa}
                                title={bolsa ? undefined : "Falta elegir qué producto se deja (Sectores)"}
                                className={`${puedeAbonar && debe ? "btn-outline" : "btn-accent"} h-12 sm:h-10 sm:flex-1 rounded-lg text-[14px] sm:text-[13px] font-semibold active:scale-[0.99] disabled:opacity-50`}>
                                {bolsa ? `Dejar ${bolsa.name.toLowerCase()}` : "Dejar mercancía"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Regalos: lo que ganó y no se le ha dado, y los que tiene apartados o recibió. */}
            {regalos_activos && (ganados.length > 0 || regalosVivos.length > 0 || puedeRegalar) && (
                <section>
                    <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Regalos</h3>
                    {ganados.length > 0 && (
                        <div className="relative mb-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] pl-4 pr-3 py-3 overflow-hidden">
                            <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-amber-500" />
                            <p className="text-[13px] font-semibold text-content dark:text-white">
                                {ganados.length === 1 ? "Saldó una bolsa sin regalo" : `Saldó ${ganados.length} bolsas sin regalo`}
                            </p>
                            <p className="text-[12px] text-content-subtle">{ganados.map(g => g.invoice_number).join(", ")}</p>
                            {puedeRegalar && (
<button type="button" onClick={() => setRegalando({ bolsa: ganados[0].id })}
                                    className="btn-outline mt-2.5 h-12 sm:h-10 w-full sm:w-auto px-4 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]">
                                    <IconoRegalo />
                                    Dar regalo
                                </button>
                            )}
                        </div>
                    )}
                    {regalosVivos.length > 0 ? (
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                            {regalosVivos.map(r => <RegaloFila key={r.id} r={r} onChanged={despues} />)}
                        </div>
                    ) : ganados.length === 0 && (
                        <p className="text-[13px] text-content-subtle">Todavía no ha recibido regalos.</p>
                    )}
                    {/* Con una bolsa saldada, el botón ya está en el aviso de arriba. */}
                    {puedeRegalar && ganados.length === 0 && (
                        <div className="mt-2">
                            <button type="button" onClick={() => setRegalando({ bolsa: null })}
                                    className="btn-outline h-12 sm:h-10 w-full px-4 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]">
                                    <IconoRegalo />
                                    Dar regalo
                                </button>
                        </div>
                    )}
                </section>
            )}

            {/* Facturas abiertas */}
            {facturas.length > 0 && (
                <section>
                    <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Por cobrar</h3>
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02]">
                        {facturas.map(f => (
                            <div key={f.id} className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{f.invoice_number || `#${f.id}`}</p>
                                    <p className="text-[12px] text-content-subtle tabular-nums">{fmtDateShort(f.created_at)} · total {fmtBase(f.total)}</p>
                                </div>
                                <Money value={fmtBase(f.balance)} className="shrink-0 text-[14px] font-semibold text-content dark:text-white" />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Historial: la tarjeta */}
            <section>
                <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Movimientos</h3>
                {historial.length === 0 ? (
                    <p className="text-[13px] text-content-subtle">Todavía no se le ha dejado nada.</p>
                ) : (
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02]">
                        {historial.map((h, i) => {
                            const esBolsa = h.kind === "bolsa";
                            if (h.kind === "regalo") {
                                return (
                                    <div key={`regalo-${h.invoice_number}`} className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-medium text-content dark:text-white">Regalo: {h.detail}</p>
                                            <p className="text-[12px] text-content-subtle tabular-nums truncate">
                                                {fmtDateShort(h.day)} · {h.invoice_number}{h.employee_name ? ` · ${toNameCase(h.employee_name)}` : ""}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 text-[12px] font-medium ${h.status === "por_entregar" ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                            {h.status === "por_entregar" ? "Por entregar" : "Entregado"}
                                        </span>
                                    </div>
                                );
                            }
                            return (
                                <div key={`${h.kind}-${h.sale_id || i}-${h.at}`} className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-content dark:text-white">
                                            {esBolsa ? `Se dejó ${h.detail || "mercancía"}` : "Abonó"}
                                        </p>
                                        <p className="text-[12px] text-content-subtle tabular-nums truncate">
                                            {fmtDateShort(h.day)}
                                            {esBolsa ? (h.invoice_number ? ` · ${h.invoice_number}` : "") : (h.journal_name ? ` · ${h.journal_name}` : "")}
                                            {h.employee_name ? ` · ${toNameCase(h.employee_name)}` : ""}
                                        </p>
                                    </div>
                                    {/* La bolsa suma a la deuda y el abono la baja: el signo lo dice, el color no. */}
                                    <Money value={`${esBolsa ? "+" : "−"}${fmtBase(h.amount)}`}
                                        className="shrink-0 text-[13px] font-semibold text-content dark:text-white" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>

            {/* Fuera del space-y: su margen se le sumaría al fondo del modal (fixed inset-0) y
                dejaría una franja sin oscurecer arriba de la pantalla. */}
            {abonando && (
                <BulkPaymentModal
                    customer={{ id: cliente.id, name: cliente.name }}
                    sales={facturas}
                    submitBulk={(body) => api.cobranza.abonar(cliente.id, body)}
                    onClose={() => setAbonando(false)}
                    onSuccess={() => { setAbonando(false); despues(); }}
                />
            )}
            {regalando && (
                <DarRegaloModal cliente={cliente} ganados={ganados} bolsaInicial={regalando.bolsa}
                    onClose={() => setRegalando(null)}
                    onDone={() => { setRegalando(null); despues(); }} />
            )}
            {dejando && bolsa && (
                <DejarBolsaModal cliente={cliente} bolsa={bolsa}
                    onClose={() => setDejando(false)}
                    onDone={() => { setDejando(false); despues(); }} />
            )}
        </>
    );
}
