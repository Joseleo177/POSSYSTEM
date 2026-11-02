import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import Segmented from "../ui/Segmented";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { toNameCase } from "../../helpers";

const vacio = { code: "", name: "", commission_pct: "", doc_id: "", phone: "", warehouse_id: "", active: true };

/**
 * Alta y edición de un vendedor. `seller`: null cerrado · {} nuevo · la fila a editar.
 * El vendedor no es un usuario: la mayoría no entra al sistema, solo se nombra en la caja.
 */
export default function SellerModal({ seller, onClose, onSaved }) {
    const { notify, sucursales = [] } = useApp();
    const [form, setForm] = useState(vacio);
    const nuevo = !seller?.id;

    useEffect(() => {
        if (!seller) return;
        setForm(seller.id ? {
            ...vacio, ...seller,
            commission_pct: String(seller.commission_pct ?? ""),
            doc_id: seller.doc_id || "", phone: seller.phone || "",
            warehouse_id: seller.warehouse_id ? String(seller.warehouse_id) : "",
        } : vacio);
    }, [seller]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const pct = parseFloat(String(form.commission_pct).replace(",", "."));
    const listo = form.code.trim() && form.name.trim() && Number.isFinite(pct) && pct >= 0 && pct <= 100;

    const guardar = async () => {
        const body = { ...form, commission_pct: pct, warehouse_id: form.warehouse_id || null };
        try {
            const r = nuevo ? await api.commissions.createSeller(body) : await api.commissions.updateSeller(seller.id, body);
            notify(nuevo ? "Vendedor creado" : "Vendedor actualizado");
            onSaved?.(r.data);
        } catch (e) { notify(e.message, "err"); }
    };

    const opcionesSucursal = [{ value: "", label: "Todas las sucursales" }, ...sucursales.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))];

    return (
        <Modal open={!!seller} onClose={onClose} title={nuevo ? "Nuevo vendedor" : "Editar vendedor"} width={520}>
            <div className="space-y-4">
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                    <Field label="Código" hint="Se teclea en la caja">
                        <input className={INPUT} data-autofocus={nuevo ? "" : undefined} autoComplete="off" maxLength={10}
                            value={form.code} onChange={e => set("code", e.target.value)} placeholder="01" />
                    </Field>
                    <Field label="Nombre">
                        <input className={INPUT} autoComplete="off" maxLength={120}
                            value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nombre y apellido" />
                    </Field>
                </div>

                <Field label="Comisión" hint="Sobre lo cobrado, sin recargos">
                    <div className="relative">
                        <input className={`${INPUT} pr-9 tabular-nums`} inputMode="decimal" autoComplete="off"
                            value={form.commission_pct} onChange={e => set("commission_pct", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="5" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                    </div>
                    {!nuevo && Number.isFinite(pct) && pct !== parseFloat(seller.commission_pct) && (
                        <p className="text-[12px] text-content-subtle mt-1">Rige para las ventas nuevas. Lo ya vendido conserva el % con que se vendió.</p>
                    )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Cédula" hint="Opcional">
                        <input className={INPUT} autoComplete="off" maxLength={20} value={form.doc_id} onChange={e => set("doc_id", e.target.value)} placeholder="V-12345678" />
                    </Field>
                    <Field label="Teléfono" hint="Opcional">
                        <input className={INPUT} autoComplete="off" inputMode="tel" maxLength={30} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="0414-0000000" />
                    </Field>
                </div>

                {sucursales.length > 1 && (
                    <Field label="Sucursal" hint="En la caja de su sucursal sale primero">
                        <CustomSelect value={form.warehouse_id} onChange={v => set("warehouse_id", v)} options={opcionesSucursal} className="w-full" boxClassName="rounded-lg" />
                    </Field>
                )}

                {!nuevo && (
                    <Field label="Estado">
                        <Segmented value={form.active ? "si" : "no"} onChange={k => set("active", k === "si")}
                            options={[{ key: "si", label: "Activo" }, { key: "no", label: "Inactivo" }]} />
                        {!form.active && <p className="text-[12px] text-content-subtle mt-1">Deja de aparecer en la caja. Su historial y su saldo se conservan.</p>}
                    </Field>
                )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                <Button onClick={guardar} disabled={!listo} className="h-12 sm:h-10 px-5">
                    {nuevo ? "Crear vendedor" : "Guardar cambios"}
                </Button>
            </div>
        </Modal>
    );
}

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70 truncate">{hint}</span>}
            </p>
            {children}
        </div>
    );
}
