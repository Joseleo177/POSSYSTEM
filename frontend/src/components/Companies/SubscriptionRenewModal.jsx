import React, { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import DatePicker from "../ui/DatePicker";

const PLANS = [
    { name: "Básico", defaultUsers: 5, color: "border-blue-500/30 text-blue-500 bg-blue-500/10" },
    { name: "Premium", defaultUsers: 15, color: "border-purple-500/30 text-purple-500 bg-purple-500/10" },
    { name: "Ilimitado", defaultUsers: 0, color: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10" },
];

const STATUSES = ["Activa", "Demo", "Suspendida", "Vencida"];

export default function SubscriptionRenewModal({ open, onClose, onSave, company, loading }) {
    const [planName, setPlanName] = useState("Básico");
    const [status, setStatus] = useState("Activa");
    const [expiresAt, setExpiresAt] = useState("");
    const [maxUsers, setMaxUsers] = useState(5);
    const [isUnlimitedDate, setIsUnlimitedDate] = useState(false);

    useEffect(() => {
        if (company) {
            setPlanName(company.plan_name || "Básico");
            setStatus(company.subscription_status || "Activa");
            setMaxUsers(company.max_users ?? 5);
            if (!company.expires_at) {
                setIsUnlimitedDate(true);
                setExpiresAt("");
            } else {
                setIsUnlimitedDate(false);
                setExpiresAt(new Date(company.expires_at).toISOString().split("T")[0]);
            }
        }
    }, [company, open]);

    const addDays = (days) => {
        const baseDate = expiresAt && new Date(expiresAt) > new Date() ? new Date(expiresAt) : new Date();
        baseDate.setDate(baseDate.getDate() + days);
        setIsUnlimitedDate(false);
        setExpiresAt(baseDate.toISOString().split("T")[0]);
    };

    const handleUnlimited = () => {
        setIsUnlimitedDate(true);
        setExpiresAt("");
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...company,
            plan_name: planName,
            subscription_status: status,
            expires_at: isUnlimitedDate ? null : expiresAt,
            max_users: Number(maxUsers)
        });
    };

    if (!company) return null;

    return (
        <Modal open={open} onClose={onClose} title={`Gestionar Suscripción - ${company.name}`} width={520}>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {/* Header info empresa */}
                <div className="bg-surface-2 dark:bg-white/[0.03] p-3 rounded-xl border border-border/40 dark:border-white/5 flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-content dark:text-white tracking-tight">{company.name}</div>
                        <div className="text-[11px] font-semibold text-content-subtle mt-0.5">RIF: {company.tax_id || "N/A"}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] font-bold uppercase text-brand-500 tracking-wider">Estado actual</div>
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-extrabold rounded-full ${
                            company.subscription_status === 'Activa' || company.subscription_status === 'Ilimitado' 
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                : company.subscription_status === 'Demo'
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}>
                            {company.subscription_status || 'Demo'}
                        </span>
                    </div>
                </div>

                {/* Extensión rápida de vigencia */}
                <div className="space-y-2">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-brand-500 block">
                        Renovación rápida de vigencia
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                        <button
                            type="button"
                            onClick={() => addDays(30)}
                            className="py-1.5 px-2 bg-surface-2 dark:bg-white/5 hover:bg-brand-500 hover:text-white text-content dark:text-white border border-border/40 dark:border-white/10 rounded-lg text-[11px] font-bold transition-all"
                        >
                            +30 días
                        </button>
                        <button
                            type="button"
                            onClick={() => addDays(90)}
                            className="py-1.5 px-2 bg-surface-2 dark:bg-white/5 hover:bg-brand-500 hover:text-white text-content dark:text-white border border-border/40 dark:border-white/10 rounded-lg text-[11px] font-bold transition-all"
                        >
                            +90 días
                        </button>
                        <button
                            type="button"
                            onClick={() => addDays(180)}
                            className="py-1.5 px-2 bg-surface-2 dark:bg-white/5 hover:bg-brand-500 hover:text-white text-content dark:text-white border border-border/40 dark:border-white/10 rounded-lg text-[11px] font-bold transition-all"
                        >
                            +180 días
                        </button>
                        <button
                            type="button"
                            onClick={() => addDays(365)}
                            className="py-1.5 px-2 bg-surface-2 dark:bg-white/5 hover:bg-brand-500 hover:text-white text-content dark:text-white border border-border/40 dark:border-white/10 rounded-lg text-[11px] font-bold transition-all"
                        >
                            +1 año
                        </button>
                        <button
                            type="button"
                            onClick={handleUnlimited}
                            className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-all ${
                                isUnlimitedDate 
                                    ? 'bg-emerald-500 text-white border-emerald-500' 
                                    : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500 hover:text-white'
                            }`}
                        >
                            Ilimitado
                        </button>
                    </div>
                </div>

                {/* Configuración de Plan y Vencimiento */}
                <div className="p-4 bg-surface-2 dark:bg-white/[0.03] rounded-2xl border border-border/40 dark:border-white/5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Plan de suscripción</label>
                            <select 
                                className="input h-10"
                                value={planName}
                                onChange={e => {
                                    const selected = e.target.value;
                                    setPlanName(selected);
                                    const found = PLANS.find(p => p.name === selected);
                                    if (found) setMaxUsers(found.defaultUsers);
                                }}
                            >
                                {PLANS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">Estado de licencia</label>
                            <select 
                                className="input h-10"
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                            >
                                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="label">Fecha de vencimiento</label>
                            {isUnlimitedDate ? (
                                <div className="h-10 px-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-xl text-[12px] font-bold flex items-center justify-between">
                                    <span>Vencimiento ilimitado</span>
                                    <button 
                                        type="button" 
                                        onClick={() => addDays(30)}
                                        className="text-[10px] underline hover:text-emerald-400"
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            ) : (
                                <DatePicker
                                    value={expiresAt}
                                    onChange={v => { setExpiresAt(v); setIsUnlimitedDate(false); }}
                                    className="w-full"
                                />
                            )}
                        </div>

                        <div>
                            <label className="label">Máx. usuarios permitidos</label>
                            <input
                                type="number"
                                min={0}
                                className="input h-10 font-mono text-[12px]"
                                value={maxUsers}
                                onChange={e => setMaxUsers(e.target.value)}
                                placeholder="0 = Sin límite"
                            />
                            <span className="text-[10px] text-content-subtle block mt-0.5">Colocar 0 para usuarios ilimitados</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? "Actualizando..." : "Aplicar Renovación"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
