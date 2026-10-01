import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import DatePicker from "../ui/DatePicker";
import CustomSelect from "../ui/CustomSelect";

const PLANS = ["Básico", "Premium", "Ilimitado"];
const STATUSES = ["Demo", "Activa", "Suspendida", "Vencida"];

const LABEL = "flex items-baseline justify-between gap-2 text-[12px] text-content-subtle mb-1.5";
const Opcional = () => <span className="text-[11px] text-content-subtle/80">Opcional</span>;

const vacio = () => ({
    name: "", tax_id: "", address: "", phone: "", email: "",
    plan_name: "Básico", subscription_status: "Demo",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    max_users: 5, active: true, catalog_enabled: false,
    admin_username: "", admin_password: "",
});

export default function CompanyModal({ open, onClose, onSave, editData, loading }) {
    const [form, setForm] = useState(vacio);

    useEffect(() => {
        if (!open) return;
        setForm(editData
            ? {
                ...editData,
                expires_at: editData.expires_at ? new Date(editData.expires_at).toISOString().split("T")[0] : "",
                admin_username: "", admin_password: "",
            }
            : vacio());
    }, [editData, open]);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    return (
        <Modal open={open} onClose={onClose} title={editData ? "Editar empresa" : "Nueva empresa"} width={540}>
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Datos */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                        <label className={LABEL}>Nombre de la empresa</label>
                        <input required data-autofocus className="input h-10" value={form.name}
                            onChange={e => set("name", e.target.value)} placeholder="Ej. Inversiones Nexus C.A." autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}>RIF <Opcional /></label>
                        <input className="input h-10" value={form.tax_id || ""} onChange={e => set("tax_id", e.target.value)}
                            placeholder="J-12345678-0" autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}>Teléfono <Opcional /></label>
                        <input className="input h-10" value={form.phone || ""} onChange={e => set("phone", e.target.value)}
                            placeholder="0412 123 4567" inputMode="tel" autoComplete="off" />
                    </div>
                    <div className="sm:col-span-2">
                        <label className={LABEL}>Correo <Opcional /></label>
                        <input type="email" className="input h-10" value={form.email || ""} onChange={e => set("email", e.target.value)}
                            placeholder="admin@empresa.com" autoComplete="off" />
                    </div>
                </section>

                {/* Administrador inicial: solo al crear */}
                {!editData && (
                    <section>
                        <h3 className="text-[14px] font-semibold text-content dark:text-white">Administrador inicial</h3>
                        <p className="text-[12px] text-content-subtle mb-3">Si los dejas vacíos se generan solos y te los muestro al crear.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={LABEL}>Usuario <Opcional /></label>
                                <input className="input h-10" value={form.admin_username} onChange={e => set("admin_username", e.target.value)}
                                    placeholder="admin_ID" autoComplete="off" spellCheck={false} />
                            </div>
                            <div>
                                <label className={LABEL}>Contraseña <Opcional /></label>
                                <input type="text" className="input h-10" value={form.admin_password} onChange={e => set("admin_password", e.target.value)}
                                    placeholder="Aleatoria" minLength={8} autoComplete="off" spellCheck={false} />
                                {/* El servidor rechaza menos de 8; avisar aquí evita el viaje. */}
                                <p className="mt-1 text-[11px] text-content-subtle">Mínimo 8 caracteres</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* Suscripción */}
                <section>
                    <h3 className="text-[14px] font-semibold text-content dark:text-white mb-3">Suscripción</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL}>Plan</label>
                            <CustomSelect value={form.plan_name} onChange={v => set("plan_name", v)}
                                options={PLANS.map(p => ({ value: p, label: p }))} className="w-full" />
                        </div>
                        <div>
                            <label className={LABEL}>Estado</label>
                            <CustomSelect value={form.subscription_status} onChange={v => set("subscription_status", v)}
                                options={STATUSES.map(s => ({ value: s, label: s }))} className="w-full" />
                        </div>
                        <div>
                            <label className={LABEL}>Vence <Opcional /></label>
                            <DatePicker value={form.expires_at} onChange={v => set("expires_at", v || "")} placeholder="Sin vencimiento" className="w-full" />
                        </div>
                        <div>
                            <label className={LABEL}>Máximo de usuarios</label>
                            <input type="number" min={0} className="input h-10 tabular-nums" value={form.max_users ?? ""}
                                onChange={e => set("max_users", e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
                            <p className="mt-1 text-[11px] text-content-subtle">0 = sin límite</p>
                        </div>
                    </div>
                </section>

                {/* El extra del catálogo público: el interruptor vive aquí y no en los Ajustes de
                    la empresa, porque no es algo que ella misma deba poder encender. Sin esto
                    la vitrina responde 404 aunque tema, banners y enlace estén listos. */}
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border/70 dark:border-white/[0.08] px-4 py-3 cursor-pointer">
                    <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-content dark:text-white">Catálogo público</span>
                        <span className="block text-[12px] text-content-subtle mt-0.5">Extra: la empresa puede publicar y personalizar su vitrina.</span>
                    </span>
                    <span className="relative inline-flex items-center shrink-0">
                        <input type="checkbox" className="sr-only peer" checked={!!form.catalog_enabled}
                            onChange={e => set("catalog_enabled", e.target.checked)} />
                        <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
                    </span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button type="submit" loading={loading} className="h-12 sm:h-10 px-5 text-[13px]">
                        {editData ? "Guardar cambios" : "Crear empresa"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
