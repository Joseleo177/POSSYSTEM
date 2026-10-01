import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import DatePicker from "../ui/DatePicker";
import CustomSelect from "../ui/CustomSelect";
import StatusMark from "../ui/StatusMark";
import { LICENSE_STATUS, estadoLicencia, vencimientoRelativo, fmtFecha, TONO_TEXTO } from "./license";

const PLANS = [
    { name: "Básico", defaultUsers: 5 },
    { name: "Premium", defaultUsers: 15 },
    { name: "Ilimitado", defaultUsers: 0 },
];
const STATUSES = ["Activa", "Demo", "Suspendida", "Vencida"];
const EXTENSIONES = [[30, "+30 días"], [90, "+90 días"], [180, "+180 días"], [365, "+1 año"]];

const LABEL = "block text-[12px] text-content-subtle mb-1.5";
const iso = (d) => d.toISOString().split("T")[0];

export default function SubscriptionRenewModal({ open, onClose, onSave, company, loading }) {
    const [planName, setPlanName] = useState("Básico");
    const [status, setStatus] = useState("Activa");
    const [expiresAt, setExpiresAt] = useState("");
    const [maxUsers, setMaxUsers] = useState(5);

    useEffect(() => {
        if (!company || !open) return;
        setPlanName(company.plan_name || "Básico");
        setStatus(company.subscription_status || "Activa");
        setMaxUsers(company.max_users ?? 5);
        setExpiresAt(company.expires_at ? iso(new Date(company.expires_at)) : "");
    }, [company, open]);

    // Se suma desde el vencimiento si todavía no llegó; si ya pasó, desde hoy: renovar una
    // licencia vencida hace un mes no debe regalar ni quitar ese mes.
    const addDays = (days) => {
        const base = expiresAt && new Date(expiresAt) > new Date() ? new Date(expiresAt) : new Date();
        base.setDate(base.getDate() + days);
        setExpiresAt(iso(base));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...company,
            plan_name: planName,
            subscription_status: status,
            expires_at: expiresAt || null,
            max_users: Number(maxUsers) || 0,
        });
    };

    if (!company) return null;

    const rel = vencimientoRelativo(expiresAt || null);

    return (
        <Modal open={open} onClose={onClose} title="Renovar suscripción" width={520}>
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* La empresa y cómo está hoy */}
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-content dark:text-white truncate">{company.name}</div>
                        <div className="text-[12px] text-content-subtle">{company.tax_id ? `RIF ${company.tax_id}` : "Sin RIF"}</div>
                    </div>
                    <StatusMark status={estadoLicencia(company)} map={LICENSE_STATUS} />
                </div>

                {/* Extender */}
                <section>
                    <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2.5">Extender vigencia</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1.5">
                        {EXTENSIONES.map(([d, l]) => (
                            <button key={d} type="button" onClick={() => addDays(d)}
                                className="btn-outline h-11 sm:h-9 rounded-lg text-[13px] font-medium tabular-nums">
                                {l}
                            </button>
                        ))}
                        <button type="button" onClick={() => setExpiresAt("")}
                            className={`h-11 sm:h-9 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap border transition-colors col-span-2 sm:col-span-1 ${!expiresAt
                                ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                                : "btn-outline"}`}>
                            Sin vencimiento
                        </button>
                    </div>
                    <p className={`mt-2 text-[12px] ${rel.tone ? TONO_TEXTO[rel.tone] : "text-content-subtle"}`}>
                        {expiresAt ? <>Queda vigente hasta el <span className="font-semibold">{fmtFecha(expiresAt)}</span> · {rel.text.toLowerCase()}</> : "Queda vigente sin fecha de vencimiento."}
                    </p>
                </section>

                {/* Plan y límites */}
                <section className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={LABEL}>Plan</label>
                        <CustomSelect
                            value={planName}
                            onChange={v => {
                                setPlanName(v);
                                const p = PLANS.find(x => x.name === v);
                                if (p) setMaxUsers(p.defaultUsers);
                            }}
                            options={PLANS.map(p => ({ value: p.name, label: p.name }))}
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className={LABEL}>Estado</label>
                        <CustomSelect value={status} onChange={setStatus}
                            options={STATUSES.map(s => ({ value: s, label: s }))} className="w-full" />
                    </div>
                    <div>
                        <label className={LABEL}>Vence</label>
                        <DatePicker value={expiresAt} onChange={v => setExpiresAt(v || "")} placeholder="Sin vencimiento" className="w-full" />
                    </div>
                    <div>
                        <label className={LABEL}>Máximo de usuarios</label>
                        <input type="number" min={0} className="input h-10 tabular-nums" value={maxUsers}
                            onChange={e => setMaxUsers(e.target.value)} />
                        <p className="mt-1 text-[11px] text-content-subtle">0 = sin límite</p>
                    </div>
                </section>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button type="submit" loading={loading} className="h-12 sm:h-10 px-5 text-[13px]">Guardar suscripción</Button>
                </div>
            </form>
        </Modal>
    );
}
