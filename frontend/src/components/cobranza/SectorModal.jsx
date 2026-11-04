import { useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import { toNameCase } from "../../helpers";

const INPUT = "h-10 w-full px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/**
 * Crear o editar un sector: su nombre, la sucursal de la que sale la mercancía y quién lo
 * trabaja. Solo se ofrecen usuarios con acceso a esa sucursal (el servidor lo exige: el abono y
 * la factura se registran contra ella).
 */
export default function SectorModal({ sector, opciones, onClose, onSaved }) {
    const { notify } = useApp();
    const sucursales = opciones?.sucursales || [];
    const [form, setForm] = useState(() => ({
        name: sector?.name || "",
        warehouse_id: String(sector?.warehouse_id || (sucursales.length === 1 ? sucursales[0].id : "")),
        notes: sector?.notes || "",
        active: sector ? sector.active : true,
        employee_ids: new Set((sector?.employees || []).map(e => e.id)),
    }));
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const usuarios = useMemo(() => {
        const wid = parseInt(form.warehouse_id);
        return (opciones?.usuarios || []).map(u => ({
            ...u,
            puede: u.role === "admin" || (wid && (u.warehouse_ids || []).includes(wid)),
        }));
    }, [opciones, form.warehouse_id]);

    const toggle = (id) => setForm(p => {
        const s = new Set(p.employee_ids);
        if (s.has(id)) s.delete(id); else s.add(id);
        return { ...p, employee_ids: s };
    });

    const guardar = async () => {
        if (!form.name.trim()) return notify("Ponle un nombre al sector", "err");
        if (!form.warehouse_id) return notify("Elige la sucursal", "err");
        const body = {
            name: form.name, warehouse_id: parseInt(form.warehouse_id), notes: form.notes, active: form.active,
            // Solo los que pueden trabajar en esa sucursal: si se cambió la sucursal, los demás salen.
            employee_ids: usuarios.filter(u => u.puede && form.employee_ids.has(u.id)).map(u => u.id),
        };
        try {
            if (sector?.id) await api.cobranza.editarSector(sector.id, body);
            else await api.cobranza.crearSector(body);
            notify(sector?.id ? "Sector guardado" : "Sector creado");
            onSaved?.();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <Modal open onClose={onClose} title={sector?.id ? `Sector ${sector.name}` : "Nuevo sector"} width={480}>
            <div className="space-y-4">
                <div>
                    <p className="text-[12px] text-content-subtle mb-1.5">Nombre del pueblo o zona</p>
                    <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej. El Espino" autoComplete="off" data-autofocus className={INPUT} />
                </div>
                <div>
                    <p className="text-[12px] text-content-subtle mb-1.5">Sucursal</p>
                    <CustomSelect value={form.warehouse_id} onChange={v => set("warehouse_id", v)}
                        options={sucursales.map(s => ({ value: String(s.id), label: s.name }))} placeholder="Elegir sucursal" />
                    <p className="mt-1 text-[12px] text-content-subtle">De aquí sale la mercancía, la serie de las facturas y las cajas del cobro.</p>
                </div>

                <div>
                    <p className="text-[12px] text-content-subtle mb-1.5">Quién lo trabaja</p>
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] max-h-64 overflow-y-auto custom-scrollbar">
                        {usuarios.length === 0 && <p className="px-3.5 py-3 text-[13px] text-content-subtle">No hay usuarios activos.</p>}
                        {usuarios.map(u => (
                            <div key={u.id} role="button" tabIndex={u.puede ? 0 : -1} aria-disabled={!u.puede}
                                onClick={() => u.puede && toggle(u.id)} onKeyDown={e => { if (u.puede && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(u.id); } }}
                                className={`w-full px-3.5 py-2.5 flex items-center gap-3 text-left ${u.puede ? "cursor-pointer" : "opacity-50"}`}>
                                <Check checked={u.puede && form.employee_ids.has(u.id)} disabled={!u.puede} onChange={() => toggle(u.id)} title={u.name} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(u.name)}</span>
                                    <span className="block text-[12px] text-content-subtle truncate">
                                        {u.role_label || u.role}{!u.puede && form.warehouse_id ? " · sin acceso a esta sucursal" : ""}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-1 text-[12px] text-content-subtle">Lo que cada uno puede hacer (abonar, dejar mercancía) se da en Usuarios → permisos.</p>
                </div>

                <div>
                    <p className="flex justify-between text-[12px] text-content-subtle mb-1.5"><span>Notas</span><span>Opcional</span></p>
                    <input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Ej. se visita los martes" autoComplete="off" className={INPUT} />
                </div>

                {sector?.id && (
                    <label className="flex items-center gap-3 cursor-pointer">
                        <Check checked={!form.active} onChange={() => set("active", !form.active)} title="Inactivo" />
                        <span className="text-[13px] text-content dark:text-white">Inactivo <span className="text-content-subtle">· no se le deja mercancía y sale de la ruta</span></span>
                    </label>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={guardar} className="!h-12 sm:!h-10 sm:flex-1">{sector?.id ? "Guardar sector" : "Crear sector"}</Button>
                </div>
            </div>
        </Modal>
    );
}
