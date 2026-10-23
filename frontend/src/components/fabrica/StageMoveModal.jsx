import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import { INPUT, Field, parseNum, errMsg } from "./shared";

/**
 * Pasar una orden a otra etapa del taller, o terminarla. La etapa en que está se cierra con
 * su tiempo y quién la hizo: eso es la mano de obra de la orden (minutos × costo por hora).
 * Vacío, el tiempo es el que la receta asigna a esa etapa.
 *
 * `order`: { id, code, current_stage_id, stage_name, assignee }
 * `target`: id de la etapa sugerida · `finish`: terminar en vez de mover.
 */
export default function StageMoveModal({ order, stages, target = null, finish = false, onClose, onDone }) {
    const { notify } = useApp();
    const [stageId, setStageId] = useState("");
    const [minutes, setMinutes] = useState("");
    const [worker, setWorker] = useState("");
    const open = !!order;

    useEffect(() => {
        if (!open) return;
        setMinutes("");
        setWorker(order.assignee || "");
        if (finish) return;
        const active = stages.filter(s => s.active !== false);
        const idx = active.findIndex(s => s.id === order.current_stage_id);
        const next = target ?? active[idx + 1]?.id ?? active.find(s => s.id !== order.current_stage_id)?.id;
        setStageId(next ? String(next) : "");
    }, [open]);

    if (!open) return null;
    const enEtapa = !!order.current_stage_id;
    const options = stages.filter(s => s.active !== false && s.id !== order.current_stage_id)
        .map(s => ({ value: String(s.id), label: s.name }));

    const save = async () => {
        const m = minutes.trim() === "" ? null : parseNum(minutes);
        if (m != null && !(m >= 0)) return notify("Los minutos no son válidos", "err");
        try {
            if (finish) {
                const r = await api.factory.finish(order.id, { minutes: m, worker: worker.trim() || null });
                const auto = (r.auto_accessories || []).map(a => `${Number(a.quantity).toLocaleString("es-VE")} ${toNameCase(a.product)}`);
                notify(`${order.code} terminada${auto.length ? `. Se descontaron de la receta: ${auto.join(", ")}` : ""}`);
            } else {
                if (!stageId) return notify("Elige la etapa", "err");
                await api.factory.moveStage(order.id, { stage_id: parseInt(stageId), minutes: m, worker: worker.trim() || null });
                notify(`${order.code} pasó a ${stages.find(s => String(s.id) === stageId)?.name}`);
            }
            onDone?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    return (
        <Modal open={open} onClose={onClose} title={finish ? `Terminar ${order.code}` : `Mover ${order.code}`} width={440}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} className="h-12 sm:h-10 px-5">{finish ? "Terminar orden" : "Mover"}</Button>
                </div>
            }>
            <div className="space-y-4">
                {!finish && (
                    <Field label="Pasa a">
                        {options.length
                            ? <CustomSelect value={stageId} onChange={setStageId} options={options} placeholder="Etapa…" />
                            : <p className="text-[13px] text-content-subtle">No hay otras etapas activas. Créalas en la pestaña Etapas.</p>}
                    </Field>
                )}
                {enEtapa && (
                    <>
                        <Field label={`Tiempo en ${order.stage_name || "la etapa actual"}`} hint="Vacío: lo de la receta">
                            <div className="relative">
                                <input value={minutes} onChange={e => setMinutes(e.target.value)} inputMode="decimal" data-autofocus
                                    placeholder="Minutos" className={`${INPUT} pr-12 tabular-nums`} />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">min</span>
                            </div>
                        </Field>
                        <Field label="Quién la hizo" hint="Opcional">
                            <input value={worker} onChange={e => setWorker(e.target.value)} maxLength={80} placeholder="Nombre del operario" className={INPUT} />
                        </Field>
                    </>
                )}
                {finish && !enEtapa && (
                    <p className="text-[13px] text-content-muted dark:text-white/70">
                        Se cierra la orden: los accesorios de la receta que falten se descuentan, y si es para inventario, el producto entra con su costo.
                    </p>
                )}
            </div>
        </Modal>
    );
}
