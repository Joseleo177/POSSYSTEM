import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtBase } from "../../helpers";
import { INPUT, CARD, Field, Prefijo, parseNum, errMsg, useKeyedAction } from "./shared";

/**
 * Etapas del taller: las columnas del tablero y la base de la mano de obra. Cada empresa
 * define las suyas (Corte, Doblez, Soldadura...) y su costo por hora.
 *
 * El costo por hora reparte la nómina, que se paga igual haya trabajo o no: lo que cuesta el
 * personal de esa etapa al mes, entre las horas que trabaja. La calculadora del formulario
 * hace esa división.
 */
export default function StagesView({ version, canManage, onChanged }) {
    const { notify, baseCurrency } = useApp();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);     // null · {} nueva · fila
    const [removing, setRemoving] = useState(null);
    const { run, busy } = useKeyedAction();

    const load = () => api.factory.stages({ all: true })
        .then(r => setRows(r.data || []))
        .catch(e => notify(errMsg(e), "err"))
        .finally(() => setLoading(false));
    useEffect(() => { setLoading(true); load(); }, [version]);

    const money = (n) => fmtBase(n, baseCurrency);
    const changed = async () => { await load(); onChanged?.(); };

    const move = (i, dir) => run(`mv-${i}`, async () => {
        const ids = rows.map(r => r.id);
        const j = i + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try { await api.factory.reorderStages(ids); await changed(); } catch (e) { notify(errMsg(e), "err"); }
    });
    const toggle = (s) => run(`tg-${s.id}`, async () => {
        try {
            await api.factory.saveStage({ id: s.id, name: s.name, cost_per_hour: s.cost_per_hour, active: !s.active });
            notify(s.active ? `"${s.name}" desactivada` : `"${s.name}" activa`);
            await changed();
        } catch (e) { notify(errMsg(e), "err"); }
    });

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-3 space-y-3">
                <p className="text-[13px] text-content-subtle leading-relaxed px-1">
                    Las etapas son las columnas del tablero del taller, en este orden. El costo por hora convierte
                    el tiempo de cada etapa en mano de obra de la orden.
                </p>

                {loading ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : rows.length === 0 ? (
                    <div className={`${CARD} px-6 py-10 text-center`}>
                        <div className="text-[14px] font-semibold text-content dark:text-white">Sin etapas</div>
                        <div className="text-[13px] text-content-subtle mt-1">Empieza con las de un taller típico y ajústalas, o crea las tuyas.</div>
                        {canManage && (
                            <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                                <Button onClick={async () => {
                                    try { await api.factory.presetStages(); notify("Etapas creadas"); await changed(); }
                                    catch (e) { notify(errMsg(e), "err"); }
                                }}>Usar Corte, Doblez, Soldadura, Pulido y Empaque</Button>
                                <Button variant="ghost" onClick={() => setEditing({})}>Crear una</Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                        {rows.map((s, i) => (
                            <div key={s.id} className={`px-4 py-3 flex items-center gap-3 ${s.active ? "" : "opacity-60"}`}>
                                <span className="w-6 text-[12px] text-content-subtle tabular-nums shrink-0">{i + 1}</span>
                                <button className="min-w-0 flex-1 text-left" disabled={!canManage} onClick={() => setEditing(s)}>
                                    <div className="text-[14px] font-semibold text-content dark:text-white truncate">{s.name}</div>
                                    <div className="text-[12px] text-content-subtle">
                                        {s.cost_per_hour > 0 ? <><Money value={money(s.cost_per_hour)} /> por hora</> : "Sin costo por hora"}
                                        {s.open_orders > 0 && ` · ${s.open_orders} orden${s.open_orders === 1 ? "" : "es"} aquí`}
                                        {!s.active && " · Inactiva"}
                                    </div>
                                </button>
                                {canManage && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => move(i, -1)} disabled={i === 0 || busy(`mv-${i}`)} aria-label="Subir" className="row-icon">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                        </button>
                                        <button onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy(`mv-${i}`)} aria-label="Bajar" className="row-icon">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        <button onClick={() => toggle(s)} disabled={busy(`tg-${s.id}`)} className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                                            {s.active ? "Desactivar" : "Activar"}
                                        </button>
                                        <button onClick={() => setRemoving(s)} aria-label="Borrar" className="row-icon hover:!text-red-600">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {canManage && rows.length > 0 && (
                    <button onClick={() => setEditing({})} className="w-full h-10 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                        + Nueva etapa
                    </button>
                )}
            </div>

            <StageModal stage={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await changed(); }} />

            <ConfirmModal
                isOpen={!!removing}
                title="Borrar etapa"
                message={removing ? `Si "${removing.name}" ya se usó en recetas u órdenes no se puede borrar: desactívala.` : ""}
                confirmText="Borrar"
                onCancel={() => setRemoving(null)}
                onConfirm={async () => {
                    try { await api.factory.deleteStage(removing.id); notify("Etapa borrada"); setRemoving(null); await changed(); }
                    catch (e) { notify(errMsg(e), "err"); }
                }}
            />
        </div>
    );
}

function StageModal({ stage, onClose, onSaved }) {
    const { notify, baseCurrency } = useApp();
    const [name, setName] = useState("");
    const [cost, setCost] = useState("");
    const [payroll, setPayroll] = useState("");
    const [hours, setHours] = useState("");
    const open = stage != null;
    const sym = baseCurrency?.symbol || "Ref.";

    useEffect(() => {
        if (!open) return;
        setName(stage?.name || "");
        setCost(stage?.cost_per_hour ? String(stage.cost_per_hour) : "");
        setPayroll(""); setHours("");
    }, [open]);

    // Nómina del mes de quienes trabajan en esta etapa ÷ las horas que trabajan al mes.
    const calc = parseNum(payroll) > 0 && parseNum(hours) > 0 ? Math.round((parseNum(payroll) / parseNum(hours)) * 100) / 100 : null;

    const save = async () => {
        if (!name.trim()) return notify("Escribe el nombre de la etapa", "err");
        const c = cost.trim() === "" ? 0 : parseNum(cost);
        if (!(c >= 0)) return notify("El costo por hora no es válido", "err");
        try {
            await api.factory.saveStage({ id: stage?.id, name: name.trim(), cost_per_hour: c });
            notify(stage?.id ? "Etapa actualizada" : "Etapa creada");
            onSaved?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    return (
        <Modal open={open} onClose={onClose} title={stage?.id ? "Editar etapa" : "Nueva etapa"} width={460}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} className="h-12 sm:h-10 px-5">Guardar</Button>
                </div>
            }>
            <div className="space-y-4">
                <Field label="Nombre">
                    <input value={name} onChange={e => setName(e.target.value)} maxLength={60} data-autofocus placeholder="Corte, Doblez, Soldadura…" className={INPUT} />
                </Field>
                <Field label="Costo por hora" hint="Opcional">
                    <div className="relative">
                        <Prefijo>{sym}</Prefijo>
                        <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${INPUT} pl-11 tabular-nums`} />
                    </div>
                </Field>
                <div className="rounded-xl bg-surface-2/60 dark:bg-white/[0.03] p-3 space-y-2">
                    <div className="text-[12px] font-medium text-content dark:text-white">Calcularlo con la nómina</div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                            <Prefijo>{sym}</Prefijo>
                            <input value={payroll} onChange={e => setPayroll(e.target.value)} inputMode="decimal" placeholder="Nómina del mes" className={`${INPUT} pl-11 tabular-nums`} />
                        </div>
                        <div className="relative">
                            <input value={hours} onChange={e => setHours(e.target.value)} inputMode="decimal" placeholder="Horas al mes" className={`${INPUT} pr-10 tabular-nums`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">h</span>
                        </div>
                    </div>
                    <p className="text-[12px] text-content-subtle leading-snug">
                        Lo que cuesta al mes el personal de esta etapa (sueldos y cargas) entre las horas que trabaja.
                        Dos soldadores de 8 h, 22 días: 352 h.
                    </p>
                    {calc != null && (
                        <button onClick={() => setCost(String(calc))} className="btn-outline h-9 px-3 rounded-lg text-[12px] font-medium">
                            Usar {fmtBase(calc, baseCurrency)} por hora
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
