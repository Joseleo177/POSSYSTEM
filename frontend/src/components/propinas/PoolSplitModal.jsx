import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import Check from "../ui/Check";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtDateShort } from "../../helpers";

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Repartir el pozo, paso 1: entre quiénes y cuánto a cada uno. Salen marcados los que atendieron
 * cuentas con propina en el período; se suman o quitan personas (cocina, barra) y se reparte en
 * partes iguales, ajustable a mano. El paso 2 es el pago (PayoutModal con `reparto`).
 *
 *   pool – { saldo, from, to, personas } · null cerrado
 */
export default function PoolSplitModal({ pool, onClose, onContinue }) {
    const { baseCurrency } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const [marcados, setMarcados] = useState({});    // id → monto (texto)
    const [total, setTotal] = useState("");

    const personas = useMemo(() => (pool?.personas || []).filter(p => p.active || p.cuentas), [pool]);

    // Al abrir: marcados los que atendieron, el pozo entero en partes iguales.
    useEffect(() => {
        if (!pool) return;
        const quienes = personas.filter(p => p.cuentas > 0).map(p => p.id);
        setTotal(String(r2(pool.saldo).toFixed(2)));
        setMarcados(repartir(quienes, r2(pool.saldo)));
    }, [pool]); // eslint-disable-line react-hooks/exhaustive-deps

    const totalNum = r2(String(total).replace(",", "."));
    const ids = Object.keys(marcados).map(Number);
    const suma = r2(ids.reduce((a, id) => a + (parseFloat(String(marcados[id]).replace(",", ".")) || 0), 0));
    const pasa = suma > r2(pool?.saldo) + 0.005;
    const listo = ids.length > 0 && suma > 0 && !pasa && ids.every(id => parseFloat(String(marcados[id]).replace(",", ".")) > 0);

    const alternar = (id) => {
        const nuevos = marcados[id] !== undefined ? ids.filter(x => x !== id) : [...ids, id];
        setMarcados(repartir(nuevos, totalNum));
    };

    const seguir = () => onContinue?.({
        shares: ids.map(id => ({ seller_id: id, amount: r2(String(marcados[id]).replace(",", ".")) })),
        total: suma,
        from: pool.from, to: pool.to,
        nombres: ids.map(id => toNameCase(personas.find(p => p.id === id)?.name)),
    });

    return (
        <Modal open={!!pool} onClose={onClose} title="Repartir el pozo" width={560}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 w-full">
                    <span className={`text-[12px] sm:mr-auto tabular-nums ${pasa ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                        {pasa ? `Pasa del pozo (${fmt(pool?.saldo)})` : `${ids.length} ${ids.length === 1 ? "persona" : "personas"} · queda en el pozo ${fmt(r2((pool?.saldo || 0) - suma))}`}
                    </span>
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    {listo && (
                        <button onClick={seguir} className="btn-accent h-12 sm:h-10 px-5 rounded-lg text-[13px] font-semibold tabular-nums">
                            Pagar {fmt(suma)}
                        </button>
                    )}
                </div>
            }>
            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[12px] text-content-subtle">En el pozo</p>
                    <p className="text-[12px] text-content-subtle">Período {fmtDateShort(pool?.from)} al {fmtDateShort(pool?.to)}</p>
                </div>
                <Money value={fmt(pool?.saldo)} className="text-[22px] font-bold tracking-tight text-content dark:text-white" />
            </div>

            <div className="mt-4 flex items-end gap-3">
                <label className="block flex-1">
                    <span className="block text-[12px] text-content-subtle mb-1.5">Cuánto se reparte</span>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{sym}</span>
                        <input value={total} inputMode="decimal" autoComplete="off"
                            onChange={e => setTotal(e.target.value.replace(/[^\d.,]/g, ""))}
                            className="w-full h-12 sm:h-10 pl-11 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] font-semibold tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    </div>
                </label>
                <button onClick={() => setMarcados(repartir(ids, totalNum))} disabled={!ids.length}
                    className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium shrink-0 disabled:opacity-40">
                    Partes iguales
                </button>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] max-h-[45vh] overflow-y-auto">
                {personas.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[13px] text-content-subtle">No hay personal. Créalo en la pestaña Personal.</div>
                ) : personas.map(p => {
                    const on = marcados[p.id] !== undefined;
                    return (
                        <div key={p.id} className="px-3.5 py-2.5 flex items-center gap-3">
                            <Check checked={on} onChange={() => alternar(p.id)} title={`Incluir a ${toNameCase(p.name)}`} />
                            <div role="button" tabIndex={0} onClick={() => alternar(p.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(p.id); } }}
                                className="flex-1 min-w-0 min-h-[44px] flex flex-col justify-center cursor-pointer">
                                <span className="block text-[14px] font-medium text-content dark:text-white truncate">{toNameCase(p.name)}</span>
                                <span className="block text-[12px] text-content-subtle">{p.cuentas ? `Atendió ${p.cuentas} ${p.cuentas === 1 ? "cuenta" : "cuentas"}` : "Sin cuentas en el período"}</span>
                            </div>
                            {on && (
                                <div className="relative w-28 shrink-0">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-content-subtle pointer-events-none">{sym}</span>
                                    <input value={marcados[p.id]} inputMode="decimal" autoComplete="off" aria-label={`Monto para ${p.name}`}
                                        onChange={e => setMarcados(m => ({ ...m, [p.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                                        className="w-full h-10 pl-10 pr-2 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-semibold text-right tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

// Partes iguales a céntimos; lo que sobra del redondeo va a los primeros.
function repartir(ids, total) {
    if (!ids.length) return {};
    const cents = Math.round((total || 0) * 100);
    const base = Math.floor(cents / ids.length);
    let resto = cents - base * ids.length;
    const out = {};
    for (const id of ids) {
        const c = base + (resto > 0 ? 1 : 0);
        if (resto > 0) resto -= 1;
        out[id] = (c / 100).toFixed(2);
    }
    return out;
}
