import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import Check from "../ui/Check";
import { Button } from "../ui/Button";
import { INPUT, AGREGAR, QUITAR, Field } from "../fabrica/shared";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import { hhmm, parseHora, hoy, DIAS, COLORES, fechaCorta } from "./shared";

// Ficha de un profesional o puesto: quién es, su horario semanal y sus ausencias.
// Un puesto (la bahía del autolavado) puede atender varias citas a la vez: su capacidad.
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

const franjasDe = (hours, d) => hours.filter(h => h.weekday === d).map(h => ({ desde: hhmm(h.start_min), hasta: hhmm(h.end_min % 1440 || 1440) }));

export default function ResourceModal({ resource, warehouseId, options, onClose, onSaved }) {
    const { notify, company } = useApp();
    const nuevo = resource && !resource.id;
    const [form, setForm] = useState(null);
    const [semana, setSemana] = useState({});            // weekday → [{ desde, hasta }]
    const [ausencias, setAusencias] = useState([]);
    const [ausencia, setAusencia] = useState(null);      // formulario de una nueva
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!resource) return;
        setForm({
            name: resource.name || "", kind: resource.kind || "persona", capacity: String(resource.capacity || 1),
            color: resource.color || COLORES[0], seller_id: String(resource.seller_id || ""), employee_id: String(resource.employee_id || ""),
            active: resource.active !== false,
        });
        const horas = resource.hours || [1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, start_min: 540, end_min: 1080 }));
        setSemana(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, franjasDe(horas, d)])));
        setAusencia(null);
        setAusencias([]);
        if (resource.id) api.agenda.blocks(resource.id).then(r => setAusencias(r.data || [])).catch(() => {});
    }, [resource]);

    if (!resource || !form) return null;
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setDia = (d, fn) => setSemana(s => ({ ...s, [d]: fn(s[d] || []) }));

    // Horario en minutos, o el primer error.
    const leerSemana = () => {
        const out = [];
        for (const d of ORDEN_DIAS) {
            for (const f of semana[d] || []) {
                const a = parseHora(f.desde), b = parseHora(f.hasta);
                if (a == null || b == null) throw new Error(`Revisa las horas del ${DIAS[d].toLowerCase()}`);
                if (b <= a) throw new Error(`El ${DIAS[d].toLowerCase()} una franja termina antes de empezar`);
                out.push({ weekday: d, start_min: a, end_min: b });
            }
        }
        return out;
    };

    const guardar = async () => {
        if (guardando) return;
        let horas;
        try { horas = leerSemana(); } catch (e) { notify(e.message, "err"); return; }
        if (!form.name.trim()) { notify("Ponle nombre", "err"); return; }
        setGuardando(true);
        try {
            const cuerpo = {
                warehouse_id: warehouseId, name: form.name, kind: form.kind, capacity: form.kind === "puesto" ? parseInt(form.capacity, 10) || 1 : 1,
                color: form.color, seller_id: form.seller_id || null, employee_id: form.employee_id || null, active: form.active,
            };
            const r = nuevo ? await api.agenda.createResource(cuerpo) : await api.agenda.updateResource(resource.id, cuerpo);
            await api.agenda.saveHours(r.data.id, horas);
            notify(nuevo ? `${form.name} ya está en la agenda` : "Cambios guardados");
            onSaved?.();
        } catch (e) { notify(e.message, "err"); }
        setGuardando(false);
    };

    const copiarLunes = () => setSemana(s => ({ ...s, ...Object.fromEntries([2, 3, 4, 5, 6].map(d => [d, (s[1] || []).map(f => ({ ...f }))])) }));

    const agregarAusencia = async () => {
        const a = ausencia;
        const sm = a.todoElDia ? null : parseHora(a.desde_hora), em = a.todoElDia ? null : parseHora(a.hasta_hora);
        if (!a.todoElDia && (sm == null || em == null)) { notify("Revisa las horas de la ausencia", "err"); return; }
        try {
            const r = await api.agenda.addBlock(resource.id, { from: a.from, to: a.to || a.from, start_min: sm, end_min: em, reason: a.reason });
            if (r.data.citas_afectadas) notify(`Ausencia guardada. Hay ${r.data.citas_afectadas} cita${r.data.citas_afectadas === 1 ? "" : "s"} en ese rato: muévela${r.data.citas_afectadas === 1 ? "" : "s"}.`, "err");
            else notify("Ausencia guardada");
            setAusencia(null);
            setAusencias((await api.agenda.blocks(resource.id)).data || []);
        } catch (e) { notify(e.message, "err"); }
    };
    const quitarAusencia = async (id) => {
        try { await api.agenda.removeBlock(id); setAusencias(xs => xs.filter(x => x.id !== id)); }
        catch (e) { notify(e.message, "err"); }
    };

    const fmtAusencia = (b) => {
        const ini = new Date(b.starts_at), fin = new Date(b.ends_at);
        const dia = (d) => fechaCorta(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        const hora = (d) => hhmm(d.getHours() * 60 + d.getMinutes());
        const diaCompleto = ini.getHours() === 0 && ini.getMinutes() === 0 && fin.getHours() === 0 && fin.getMinutes() === 0;
        if (diaCompleto) {
            const ultimo = new Date(fin.getTime() - 1);
            return dia(ini) === dia(ultimo) ? `${dia(ini)}, todo el día` : `${dia(ini)} al ${dia(ultimo)}`;
        }
        return `${dia(ini)} ${hora(ini)} – ${dia(ini) === dia(fin) ? "" : dia(fin) + " "}${hora(fin)}`;
    };

    const footer = (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            <Button onClick={guardar} loading={guardando} className="h-12 sm:h-10 px-5 text-[13px]">{nuevo ? "Agregar a la agenda" : "Guardar cambios"}</Button>
        </div>
    );

    return (
        <Modal open onClose={onClose} title={nuevo ? "Nuevo profesional o puesto" : toNameCase(resource.name)} width={640} footer={footer}>
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
                    <Field label="Nombre">
                        <input value={form.name} onChange={e => set("name", e.target.value)} maxLength={80} autoComplete="off"
                            placeholder={form.kind === "puesto" ? "Bahía de lavado" : "Carlos"} data-autofocus={nuevo || undefined} className={INPUT} />
                    </Field>
                    <Field label="Tipo">
                        <Segmented value={form.kind} onChange={v => set("kind", v)}
                            options={[{ key: "persona", label: "Persona" }, { key: "puesto", label: "Puesto" }]} />
                    </Field>
                </div>
                {form.kind === "puesto" && (
                    <Field label="Citas a la vez" hint="Ej.: 2 bahías = 2 carros al mismo tiempo">
                        <input value={form.capacity} onChange={e => set("capacity", e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={`${INPUT} !w-24`} />
                    </Field>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Su usuario" hint="Para ver «mi agenda»">
                        <CustomSelect value={form.employee_id} onChange={v => set("employee_id", v)}
                            options={[{ value: "", label: "Sin usuario" }, ...(options?.employees || []).map(e => ({ value: String(e.id), label: toNameCase(e.name) || e.username }))]} />
                    </Field>
                    {company?.comisiones_enabled && (
                        <Field label="Vendedor" hint="Gana la comisión">
                            <CustomSelect value={form.seller_id} onChange={v => set("seller_id", v)}
                                options={[{ value: "", label: "Sin comisión" }, ...(options?.sellers || []).map(s => ({ value: String(s.id), label: `${s.code} · ${toNameCase(s.name)}` }))]} />
                        </Field>
                    )}
                </div>

                <Field label="Color">
                    <div className="flex flex-wrap gap-2">
                        {COLORES.map(c => (
                            <button key={c} type="button" onClick={() => set("color", c)} aria-label={`Color ${c}`}
                                className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? "ring-2 ring-offset-2 ring-content/40 dark:ring-white/50 dark:ring-offset-surface-dark-2 scale-105" : ""}`}
                                style={{ background: c }} />
                        ))}
                    </div>
                </Field>

                {/* Horario semanal */}
                <div>
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                        <span className="text-[14px] font-semibold text-content dark:text-white">Horario</span>
                        <button type="button" onClick={copiarLunes} className="text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">Copiar el lunes a martes–sábado</button>
                    </div>
                    <div className="divide-y divide-border/60 dark:divide-white/[0.06] rounded-xl border border-border/60 dark:border-white/[0.06]">
                        {ORDEN_DIAS.map(d => {
                            const franjas = semana[d] || [];
                            return (
                                <div key={d} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-start gap-2">
                                    <div className="sm:w-24 pt-0 sm:pt-2.5 text-[13px] font-medium text-content dark:text-white">{DIAS[d]}</div>
                                    <div className="flex-1 space-y-2">
                                        {franjas.length === 0 && <div className="sm:pt-2.5 text-[13px] text-content-subtle">Libre</div>}
                                        {franjas.map((f, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <input value={f.desde} onChange={e => setDia(d, xs => xs.map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))}
                                                    inputMode="numeric" autoComplete="off" className={`${INPUT} !w-24 tabular-nums ${parseHora(f.desde) == null ? "!border-red-500" : ""}`} />
                                                <span className="text-content-subtle text-[12px]">a</span>
                                                <input value={f.hasta} onChange={e => setDia(d, xs => xs.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))}
                                                    inputMode="numeric" autoComplete="off" className={`${INPUT} !w-24 tabular-nums ${parseHora(f.hasta) == null ? "!border-red-500" : ""}`} />
                                                <button type="button" onClick={() => setDia(d, xs => xs.filter((_, j) => j !== i))} className={QUITAR} aria-label="Quitar franja">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button type="button" className={`${AGREGAR} sm:!w-36 !h-10 shrink-0`}
                                        onClick={() => setDia(d, xs => [...xs, xs.length ? { desde: xs[xs.length - 1].hasta, hasta: "19:00" } : { desde: "09:00", hasta: "18:00" }])}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                        {franjas.length ? "Otra franja" : "Trabaja"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[12px] text-content-subtle mt-1.5">Dos franjas el mismo día dejan el hueco del almuerzo.</p>
                </div>

                {/* Ausencias */}
                {!nuevo && (
                    <div>
                        <div className="text-[14px] font-semibold text-content dark:text-white mb-2">Ausencias</div>
                        {ausencias.length > 0 && (
                            <div className="divide-y divide-border/60 dark:divide-white/[0.06] rounded-xl border border-border/60 dark:border-white/[0.06] mb-2">
                                {ausencias.map(b => (
                                    <div key={b.id} className="px-3 py-2 flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-medium text-content dark:text-white first-letter:uppercase">{fmtAusencia(b)}</div>
                                            {b.reason && <div className="text-[12px] text-content-subtle truncate">{b.reason}</div>}
                                        </div>
                                        <button type="button" onClick={() => quitarAusencia(b.id)} className={QUITAR} aria-label="Quitar ausencia">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {ausencia ? (
                            <div className="rounded-xl border border-border/60 dark:border-white/[0.06] p-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Desde"><DatePicker value={ausencia.from} onChange={v => v && setAusencia(a => ({ ...a, from: v, to: a.to < v ? v : a.to }))} clearable={false} /></Field>
                                    <Field label="Hasta"><DatePicker value={ausencia.to} onChange={v => v && setAusencia(a => ({ ...a, to: v }))} clearable={false} /></Field>
                                </div>
                                <label className="flex items-center gap-2 text-[13px] text-content dark:text-white cursor-pointer">
                                    <Check checked={ausencia.todoElDia} onChange={v => setAusencia(a => ({ ...a, todoElDia: v }))} />
                                    Todo el día
                                </label>
                                {!ausencia.todoElDia && (
                                    <div className="flex items-center gap-2">
                                        <input value={ausencia.desde_hora} onChange={e => setAusencia(a => ({ ...a, desde_hora: e.target.value }))} placeholder="14:00" inputMode="numeric" autoComplete="off" className={`${INPUT} !w-24 tabular-nums`} />
                                        <span className="text-content-subtle text-[12px]">a</span>
                                        <input value={ausencia.hasta_hora} onChange={e => setAusencia(a => ({ ...a, hasta_hora: e.target.value }))} placeholder="16:00" inputMode="numeric" autoComplete="off" className={`${INPUT} !w-24 tabular-nums`} />
                                    </div>
                                )}
                                <input value={ausencia.reason} onChange={e => setAusencia(a => ({ ...a, reason: e.target.value }))} maxLength={120} placeholder="Motivo (opcional): vacaciones, diligencia…" autoComplete="off" className={INPUT} />
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                                    <button type="button" onClick={() => setAusencia(null)} className="btn-outline h-12 sm:h-9 px-4 rounded-lg text-[13px] font-medium">Cancelar</button>
                                    <Button onClick={agregarAusencia} className="h-12 sm:h-9 px-4 text-[13px]">Guardar ausencia</Button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" className={AGREGAR} onClick={() => setAusencia({ from: hoy(), to: hoy(), todoElDia: true, desde_hora: "", hasta_hora: "", reason: "" })}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                Agregar ausencia
                            </button>
                        )}
                    </div>
                )}

                {!nuevo && (
                    <label className="flex items-center gap-2 text-[13px] text-content dark:text-white cursor-pointer">
                        <Check checked={!form.active} onChange={v => set("active", !v)} />
                        Sacar de la agenda (ya no atiende aquí)
                    </label>
                )}
            </div>
        </Modal>
    );
}
