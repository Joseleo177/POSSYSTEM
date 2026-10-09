import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../../services/api";
import { fmtDateShort, fmtDayLabel, fmtMoney, toNameCase } from "../../../helpers";
import Segmented from "../../ui/Segmented";
import StatusMark from "../../ui/StatusMark";
import Money from "../../ui/Money";
import ConfirmModal from "../../ui/ConfirmModal";
import { RowIcon } from "../../ui/Ledger";
import { Spinner } from "../../ui/Spinner";
import LinePanel from "./LinePanel";
import ChargesModal from "./ChargesModal";
import { LINE_STATUS, KIND_LABEL, fmtLine, lineAmount, plural } from "./reconMeta";

const LABEL = "text-[12px] text-content-subtle";

function LineRow({ line, symbol, selected, onClick }) {
    const first = line.matches[0];
    const sub = [
        line.reference ? `Ref. ${line.reference}` : null,
        KIND_LABEL[line.kind] || null,
        line.status === "conciliado" && first ? (first.invoice_count > 1 ? `Cobro conjunto · ${first.invoice_count} facturas` : first.role === "creado" && first.shared_lines > 1 ? `${first.source_type === "income" ? "Ingreso" : "Egreso"} conjunto · ${first.shared_lines} líneas` : first.title) + (line.matches.length > 1 ? ` y ${line.matches.length - 1} más` : "") : null,
        line.status === "ignorado" ? (line.note || "Ignorada") : null,
    ].filter(Boolean).join(" · ");
    return (
        <button onClick={onClick}
            className={`relative w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${selected ? "bg-brand-500/[0.07]" : "hover:bg-surface-2/60 dark:hover:bg-white/[0.03]"}`}>
            {/* Filete: lo que falta casar, o la línea abierta en el panel. Va como pieza propia
                y no como borde: el divide-y de la lista le pisaba el color a todas menos la primera. */}
            {(selected || line.status === "pendiente") && (
                <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-[3px] ${selected ? "bg-brand-500" : "bg-amber-500/70"}`} />
            )}
            <div className="min-w-0 flex-1">
                <div className={`text-[13px] truncate ${line.status === "pendiente" ? "font-semibold text-content dark:text-white" : "text-content dark:text-white/85"}`}>{line.description || "Sin descripción"}</div>
                <div className="text-[12px] text-content-subtle truncate">{sub || " "}</div>
            </div>
            <div className="shrink-0 text-right">
                <Money value={fmtLine(line, symbol)} className={`text-[13px] font-semibold ${line.status === "ignorado" ? "text-content-subtle" : "text-content dark:text-white"}`} />
                <div className="mt-0.5"><StatusMark status={line.status} map={LINE_STATUS} /></div>
            </div>
        </button>
    );
}

export default function StatementView({ id, notify, onBack }) {
    const [st, setSt]             = useState(null);
    const [loading, setLoading]   = useState(true);
    const [filter, setFilter]     = useState("pendiente");
    const [search, setSearch]     = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [warehouses, setWarehouses] = useState([]);
    const [autoBusy, setAutoBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showCharges, setShowCharges] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.reconciliation.getOne(id);
            setSt(r.data);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    }, [id, notify]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api.warehouses.getAll().then(r => setWarehouses((r.data || []).filter(w => w.sells !== false))).catch(() => {});
    }, []);

    const symbol = st?.currency_symbol || "Ref.";
    const lines = useMemo(() => st?.lines || [], [st]);

    const counts = useMemo(() => ({
        pendiente: lines.filter(l => l.status === "pendiente").length,
        conciliado: lines.filter(l => l.status !== "pendiente").length,
        todas: lines.length,
    }), [lines]);

    // Volumen por explicar: abonos y cargos suman, no se compensan. Restarlos daba una cifra
    // que no correspondía a ninguna línea.
    const pendingAmount = lines.filter(l => l.status === "pendiente").reduce((s, l) => s + lineAmount(l), 0);
    const totals = useMemo(() => ({
        credit: lines.reduce((s, l) => s + l.credit, 0),
        debit: lines.reduce((s, l) => s + l.debit, 0),
    }), [lines]);
    const charges = lines.filter(l => l.status === "pendiente" && KIND_LABEL[l.kind]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return lines.filter(l =>
            (filter === "todas" || (filter === "pendiente" ? l.status === "pendiente" : l.status !== "pendiente")) &&
            (!q || [l.description, l.reference, String(lineAmount(l).toFixed(2)), ...l.matches.map(m => m.title)].some(v => String(v || "").toLowerCase().includes(q))));
    }, [lines, filter, search]);

    const byDay = useMemo(() => {
        const g = [];
        for (const l of filtered) {
            const last = g[g.length - 1];
            if (last && last.date === l.date) last.lines.push(l);
            else g.push({ date: l.date, lines: [l] });
        }
        return g;
    }, [filtered]);

    const selected = lines.find(l => l.id === selectedId) || null;

    // Tras resolver una línea se pasa sola a la siguiente pendiente: así se recorre el
    // extracto sin volver a la lista en cada paso.
    const afterChange = async (resolvedId) => {
        const idx = filtered.findIndex(l => l.id === resolvedId);
        await load();
        if (filter === "pendiente") {
            const next = filtered.slice(idx + 1).find(l => l.status === "pendiente") || filtered.slice(0, idx).find(l => l.status === "pendiente");
            setSelectedId(next ? next.id : null);
        }
    };

    const rerunAuto = async () => {
        setAutoBusy(true);
        try {
            const r = await api.reconciliation.auto(id);
            notify(r.matched ? `${plural(r.matched, "línea casada", "líneas casadas")}` : "No hubo coincidencias nuevas");
            await load();
        } catch (e) { notify(e.message, "err"); }
        finally { setAutoBusy(false); }
    };

    const remove = async () => {
        try {
            await api.reconciliation.remove(id);
            notify("Extracto eliminado");
            onBack();
        } catch (e) { notify(e.message, "err"); setConfirmDelete(false); }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
    }
    if (!st) return null;

    const done = lines.length - counts.pendiente;
    const pct = lines.length ? Math.round((done / lines.length) * 100) : 0;

    return (
        <div className="h-full flex flex-col overflow-y-auto lg:overflow-hidden">
            {/* ── Cabecera ── */}
            <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border/60 dark:border-white/[0.06] space-y-3">
                <div className="flex items-start gap-2">
                    <button onClick={onBack} className="row-icon -ml-1.5 mt-0.5" title="Volver a los extractos" aria-label="Volver a los extractos">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.01em] text-content dark:text-white truncate">
                            {toNameCase(st.bank_name)} <span className="text-content-subtle font-medium">· {symbol}</span>
                        </h2>
                        <p className="text-[12px] text-content-subtle truncate">
                            {fmtDateShort(st.date_from)} al {fmtDateShort(st.date_to)}
                            <span className="hidden sm:inline">{st.filename ? ` · ${st.filename}` : ""}</span>
                            {` · ${st.warehouse_name ? toNameCase(st.warehouse_name) : "Toda la cuenta"}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {charges.length > 0 && (
                            <button onClick={() => setShowCharges(true)} className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium hidden sm:flex items-center gap-1.5">
                                Registrar comisiones
                                <span className="text-content-subtle tabular-nums">{charges.length}</span>
                            </button>
                        )}
                        <button onClick={rerunAuto} disabled={autoBusy || !counts.pendiente} title="Volver a buscar coincidencias con lo que se haya registrado después"
                            className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50">
                            {autoBusy ? <Spinner /> : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            )}
                            <span className="hidden sm:inline">Casar de nuevo</span>
                        </button>
                        <RowIcon icon="trash" tone="danger" title="Eliminar extracto" onClick={() => setConfirmDelete(true)} />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
                    <div className="min-w-0">
                        <div className={LABEL}>{counts.pendiente ? `Por conciliar · ${plural(counts.pendiente, "línea", "líneas")}` : "Extracto conciliado"}</div>
                        {counts.pendiente
                            ? <Money value={fmtMoney(Math.abs(pendingAmount), symbol)} className="text-[24px] font-bold tracking-tight text-content dark:text-white" />
                            : (
                                <div className="flex items-center gap-1.5 text-[18px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Todo cuadra con el banco
                                </div>
                            )}
                    </div>
                    <dl className="grid grid-cols-3 sm:flex sm:items-end gap-x-6 gap-y-2 sm:ml-auto">
                        <div><dt className={LABEL}>Abonos</dt><dd><Money value={fmtMoney(totals.credit, symbol)} className="text-[13px] sm:text-[14px] font-medium text-content dark:text-white" /></dd></div>
                        <div><dt className={LABEL}>Cargos</dt><dd><Money value={`-${fmtMoney(totals.debit, symbol)}`} className="text-[13px] sm:text-[14px] font-medium text-content dark:text-white" /></dd></div>
                        {st.closing_balance !== null && (
                            <div><dt className={LABEL}>Saldo final</dt><dd><Money value={fmtMoney(st.closing_balance, symbol)} className="text-[13px] sm:text-[14px] font-medium text-content dark:text-white" /></dd></div>
                        )}
                        <div className="col-span-3 sm:col-span-1 sm:w-36">
                            <dt className={`${LABEL} flex justify-between`}><span>Avance</span><span className="tabular-nums">{done} de {lines.length}</span></dt>
                            <dd className="mt-1.5 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                                <div className="h-full rounded-full bg-content-subtle/50 dark:bg-white/40" style={{ width: `${pct}%` }} />
                            </dd>
                        </div>
                    </dl>
                </div>

                {charges.length > 0 && (
                    <button onClick={() => setShowCharges(true)} className="sm:hidden btn-outline w-full h-12 rounded-lg text-[13px] font-medium">
                        Registrar {plural(charges.length, "comisión del banco", "comisiones del banco")}
                    </button>
                )}

                <div className="flex items-center gap-2">
                    <Segmented
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { key: "pendiente", label: "Por conciliar", count: counts.pendiente },
                            { key: "conciliado", label: "Resueltas", count: counts.conciliado },
                            { key: "todas", label: "Todas", count: counts.todas },
                        ]}
                    />
                    <div className="relative flex-1 min-w-0 hidden sm:block max-w-sm ml-auto">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar descripción, referencia o monto…"
                            autoComplete="off" spellCheck={false} className="input h-9 pl-9 text-[13px] w-full" />
                    </div>
                </div>
                <div className="relative sm:hidden">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en el extracto…"
                        autoComplete="off" spellCheck={false} className="input h-9 pl-9 text-[13px] w-full" />
                </div>
            </div>

            {/* ── Cuerpo: líneas a la izquierda, panel de la línea a la derecha ── */}
            <div className="lg:flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr]">
                <div className="lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:border-r border-border/60 dark:border-white/[0.06]">
                    {!filtered.length ? (
                        <div className="py-16 text-center px-6">
                            <div className="w-11 h-11 mx-auto mb-3 rounded-2xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="text-[14px] font-semibold text-content dark:text-white">
                                {search ? "Nada coincide con la búsqueda" : filter === "pendiente" ? "No queda nada por conciliar" : "Sin líneas"}
                            </div>
                            <div className="text-[13px] text-content-subtle mt-1">
                                {filter === "pendiente" && !search ? "Cada movimiento del banco ya tiene su explicación en el sistema." : "Prueba con otro filtro."}
                            </div>
                        </div>
                    ) : byDay.map(g => (
                        <div key={g.date}>
                            <div className="sticky top-0 z-[1] px-4 pt-3 pb-1.5 bg-surface-2/95 dark:bg-[#0f1117]/95 backdrop-blur-sm flex items-baseline gap-2.5">
                                <span className="text-[14px] font-bold tracking-[-0.01em] text-content dark:text-white">{fmtDayLabel(g.date)}</span>
                                <span className="text-[12px] font-medium text-content-subtle tabular-nums">{fmtDateShort(g.date)}</span>
                            </div>
                            <div className="mx-4 mb-1 rounded-xl bg-white dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] overflow-hidden divide-y divide-border/60 dark:divide-white/[0.06]">
                                {g.lines.map(l => (
                                    <LineRow key={l.id} line={l} symbol={symbol} selected={l.id === selectedId} onClick={() => setSelectedId(l.id)} />
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="h-4" />
                </div>

                {/* Velo de la hoja en el teléfono */}
                {selected && (
                    <div onClick={() => setSelectedId(null)} className="lg:hidden fixed inset-0 z-[790] bg-black/50 catalog-overlay-in" />
                )}
                <div className={`flex-col min-h-0 overflow-y-auto custom-scrollbar lg:flex lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-0 lg:shadow-none lg:bg-surface-2/40 lg:dark:bg-white/[0.01] ${selected
                    ? "flex fixed inset-x-0 bottom-0 z-[800] max-h-[88vh] rounded-t-3xl border-t border-border/20 dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] sheet-up safe-area-bottom"
                    : "hidden"}`}>
                    {selected ? (
                        <>
                            <div className="lg:hidden sticky top-0 z-10 bg-white dark:bg-surface-dark-2 pt-2.5 pb-1 px-5 flex items-center justify-between border-b border-border/10 dark:border-white/[0.06]">
                                <span className="w-10 h-1 rounded-full bg-content-subtle/30 absolute left-1/2 -translate-x-1/2 top-1.5" />
                                <span className="text-[13px] font-semibold text-content dark:text-white mt-2">Línea del banco</span>
                                <button onClick={() => setSelectedId(null)} className="row-icon mt-2 -mr-1.5" aria-label="Cerrar">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <LinePanel
                                key={selected.id}
                                statement={st}
                                line={selected}
                                warehouses={warehouses}
                                notify={notify}
                                onChanged={() => afterChange(selected.id)}
                                onUndone={load}
                            />
                        </>
                    ) : (
                        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center px-8 py-10">
                            <div className="w-12 h-12 mb-3 rounded-2xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            </div>
                            <div className="text-[14px] font-semibold text-content dark:text-white">Elige una línea del banco</div>
                            <div className="text-[13px] text-content-subtle mt-1 max-w-xs">Verás los cobros, ingresos o egresos que pueden explicarla y la casarás con uno o varios.</div>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmDelete}
                title="Eliminar extracto"
                message={done
                    ? "Este extracto tiene líneas resueltas. Deshazlas primero: el sistema no elimina un extracto con cobros verificados."
                    : "Se borran sus líneas. Los cobros y egresos del sistema no se tocan. Podrás volver a subir el archivo."}
                confirmText="Eliminar"
                onConfirm={remove}
                onCancel={() => setConfirmDelete(false)}
            />

            <ChargesModal
                open={showCharges}
                onClose={() => setShowCharges(false)}
                statement={st}
                lines={charges}
                warehouses={warehouses}
                notify={notify}
                onDone={() => { setShowCharges(false); load(); }}
            />
        </div>
    );
}
