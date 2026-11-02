import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Check from "./ui/Check";
import { Button } from "./ui/Button";
import { api } from "../services/api";
import { hasPermission } from "../constants/permissions";
import { toNameCase } from "../helpers";

/**
 * Permisos de una persona: los de su rol con sus excepciones. El rol es la plantilla; aquí se le
 * da algo de más ("Extra") o se le quita algo que el rol tiene ("Quitado"). Solo se guardan las
 * diferencias, así que editar el rol sigue llegando a esta persona en todo lo demás.
 *
 *   employee – fila de la lista (con role_id y permission_overrides) · null cerrado
 *   role     – su rol, con `permissions`
 *   catalog  – módulos y acciones (GET /employees/permissions)
 */
export default function EmployeePermissionsModal({ employee, role, catalog, onClose, onSaved, notify }) {
    const [ov, setOv] = useState({});

    useEffect(() => { setOv({ ...(employee?.permission_overrides || {}) }); }, [employee]);

    const delRol = (k) => hasPermission(role?.permissions || {}, k);
    const tiene = (k) => (k in ov ? ov[k] : delRol(k));

    // Dejar la casilla como la tiene el rol borra la excepción: nunca se guarda "igual al rol".
    const poner = (next, k, valor) => {
        if (valor === delRol(k)) delete next[k]; else next[k] = valor;
    };
    const toggle = (k) => setOv(prev => { const next = { ...prev }; poner(next, k, !tiene(k)); return next; });
    const toggleModule = (mod) => {
        const keys = mod.actions.map(a => `${mod.key}.${a.key}`);
        const todas = keys.every(tiene);
        setOv(prev => { const next = { ...prev }; keys.forEach(k => poner(next, k, !todas)); return next; });
    };

    const extras   = Object.values(ov).filter(v => v === true).length;
    const quitados = Object.values(ov).filter(v => v === false).length;

    const guardar = async () => {
        try {
            await api.employees.updatePermissions(employee.id, { overrides: ov });
            notify(`Permisos de ${toNameCase(employee.full_name)} guardados`);
            onSaved?.();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <Modal open={!!employee} onClose={onClose} title={employee ? `Permisos · ${toNameCase(employee.full_name)}` : ""} width={720}
            footer={employee && (
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={guardar} className="h-12 sm:h-10 px-5">Guardar permisos</Button>
                </div>
            )}>
            {employee && (
                <div>
                    <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[13px] text-content dark:text-white">
                                Parte del rol <span className="font-semibold">{role?.label || "—"}</span>
                            </p>
                            <p className="text-[12px] text-content-subtle">Marca lo que quieras darle de más o quitarle solo a esta persona. Lo demás sigue al rol. Se aplica en segundos; en su pantalla aparece al recargar.</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[12px] tabular-nums">
                            {extras > 0 && <span className="text-content dark:text-white"><span className="font-semibold">{extras}</span> {extras === 1 ? "extra" : "extras"}</span>}
                            {quitados > 0 && <span className="text-amber-700 dark:text-amber-400"><span className="font-semibold">{quitados}</span> {quitados === 1 ? "quitado" : "quitados"}</span>}
                            {(extras > 0 || quitados > 0) ? (
                                <button onClick={() => setOv({})} className="text-content-subtle hover:text-content dark:hover:text-white underline-offset-2 hover:underline h-8">
                                    Igual al rol
                                </button>
                            ) : (
                                <span className="text-content-subtle">Igual al rol</span>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {catalog.map(mod => {
                            const keys  = mod.actions.map(a => `${mod.key}.${a.key}`);
                            const dadas = keys.filter(tiene).length;
                            const todas = dadas === keys.length;
                            return (
                                <section key={mod.key} className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                                    <div role="presentation" onClick={() => toggleModule(mod)}
                                        className="px-3.5 py-2.5 flex items-center gap-3 bg-surface-2/60 dark:bg-white/[0.02] border-b border-border/60 dark:border-white/[0.06] cursor-pointer">
                                        <Check checked={todas} onChange={() => toggleModule(mod)} title={todas ? "Quitar todo el módulo" : "Dar todo el módulo"} />
                                        <span className="flex-1 min-w-0 text-[13px] font-semibold text-content dark:text-white truncate">{mod.label}</span>
                                        <span className="shrink-0 text-[12px] text-content-subtle tabular-nums">{dadas} de {keys.length}</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 py-1">
                                        {mod.actions.map(act => {
                                            const k = `${mod.key}.${act.key}`;
                                            const on = tiene(k);
                                            const marca = k in ov ? (ov[k] ? "Extra" : "Quitado") : null;
                                            return (
                                                <div key={k} role="presentation" onClick={() => toggle(k)}
                                                    className="flex items-center gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-surface-2/70 dark:hover:bg-white/[0.025] transition-colors">
                                                    <Check checked={on} onChange={() => toggle(k)} title={act.label} />
                                                    <span className={`flex-1 min-w-0 text-[13px] leading-tight ${on ? "text-content dark:text-white" : "text-content-subtle"} ${marca === "Quitado" ? "line-through decoration-content-subtle/60" : ""}`}>
                                                        {act.label}
                                                    </span>
                                                    {marca && (
                                                        <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${marca === "Extra"
                                                            ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
                                                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                                                            {marca}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                </div>
            )}
        </Modal>
    );
}
