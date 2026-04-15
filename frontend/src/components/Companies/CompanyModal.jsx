import React, { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

const PLANS = ["Básico", "Premium", "Ilimitado"];
const STATUSES = ["Demo", "Activa", "Suspendida", "Vencida"];

export default function CompanyModal({ open, onClose, onSave, editData, loading }) {
    const [form, setForm] = useState({
        name: "",
        tax_id: "",
        address: "",
        phone: "",
        email: "",
        plan_name: "Básico",
        subscription_status: "Demo",
        expires_at: "",
        max_users: 5,
        active: true
    });

    useEffect(() => {
        if (editData) {
            setForm({
                ...editData,
                expires_at: editData.expires_at ? new Date(editData.expires_at).toISOString().split('T')[0] : ""
            });
        } else {
            setForm({
                name: "",
                tax_id: "",
                address: "",
                phone: "",
                email: "",
                plan_name: "Básico",
                subscription_status: "Demo",
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                max_users: 5,
                active: true
            });
        }
    }, [editData, open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(form);
    };

    return (
        <Modal open={open} onClose={onClose} title={editData ? "Editar Empresa" : "Nueva Empresa"} width={500}>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="label">NOMBRE DE LA EMPRESA *</label>
                        <input
                            required
                            className="input h-10"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="Ej: Inversiones Nexus C.A."
                        />
                    </div>
                    <div>
                        <label className="label">RIF / TAX ID</label>
                        <input
                            className="input h-10"
                            value={form.tax_id}
                            onChange={e => setForm({ ...form, tax_id: e.target.value })}
                            placeholder="J-12345678-0"
                        />
                    </div>
                    <div>
                        <label className="label">TELÉFONO</label>
                        <input
                            className="input h-10"
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                            placeholder="+58 412..."
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="label">CORREO ELECTRÓNICO</label>
                        <input
                            type="email"
                            className="input h-10"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            placeholder="admin@empresa.com"
                        />
                    </div>
                </div>

                <div className="p-4 bg-surface-2 dark:bg-white/[0.03] rounded-2xl border border-border/40 dark:border-white/5 space-y-4">
                    <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest border-b border-brand-500/10 pb-2">
                        Suscripción y Límites
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">PLAN</label>
                            <select 
                                className="input h-10"
                                value={form.plan_name}
                                onChange={e => setForm({ ...form, plan_name: e.target.value })}
                            >
                                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">ESTADO</label>
                            <select 
                                className="input h-10 text-[11px] font-bold"
                                value={form.subscription_status}
                                onChange={e => setForm({ ...form, subscription_status: e.target.value })}
                            >
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">VENCE EL</label>
                            <input
                                type="date"
                                className="input h-10 font-mono text-[11px]"
                                value={form.expires_at}
                                onChange={e => setForm({ ...form, expires_at: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="label">MÁX. USUARIOS</label>
                            <input
                                type="number"
                                className="input h-10 font-mono text-[11px]"
                                value={form.max_users}
                                onChange={e => setForm({ ...form, max_users: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border/10 dark:border-white/5">
                    <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? "Procesando..." : editData ? "Guardar Cambios" : "Crear Empresa"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
