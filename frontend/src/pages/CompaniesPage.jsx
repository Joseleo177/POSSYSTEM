import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "../components/ui/Button";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import CompanyModal from "../components/Companies/CompanyModal";
import SubscriptionRenewModal from "../components/Companies/SubscriptionRenewModal";
import Modal from "../components/ui/Modal";

export default function CompaniesPage() {
    const { notify } = useApp();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState("general"); // "general" | "subscriptions"
    const [subFilter, setSubFilter] = useState("all"); // "all" | "active" | "demo" | "expiring" | "expired" | "suspended"
    
    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [saving, setSaving] = useState(false);
    
    // Renew Modal state
    const [renewModalOpen, setRenewModalOpen] = useState(false);
    const [renewCompany, setRenewCompany] = useState(null);
    const [renewing, setRenewing] = useState(false);

    // Credentials modal state
    const [credentialsModal, setCredentialsModal] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.companies.getAll();
            setCompanies(res.companies || []);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async (form) => {
        setSaving(true);
        try {
            if (editData) {
                await api.companies.update(editData.id, form);
                notify("Empresa actualizada con éxito");
                setModalOpen(false);
            } else {
                const res = await api.companies.create(form);
                notify("Empresa creada con éxito");
                setModalOpen(false);
                if (res.company?.default_credentials) {
                    setCredentialsModal({
                        ...res.company.default_credentials,
                        companyName: form.name
                    });
                }
            }
            load();
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setSaving(false);
        }
    };

    const handleRenewSave = async (updatedData) => {
        setRenewing(true);
        try {
            await api.companies.update(updatedData.id, updatedData);
            notify(`Suscripción de "${updatedData.name}" actualizada con éxito`);
            setRenewModalOpen(false);
            setRenewCompany(null);
            load();
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setRenewing(false);
        }
    };

    const handleToggleStatus = async (company) => {
        const newStatus = company.subscription_status === 'Suspendida' ? 'Activa' : 'Suspendida';
        try {
            await api.companies.update(company.id, {
                ...company,
                subscription_status: newStatus
            });
            notify(`Empresa "${company.name}" ${newStatus === 'Activa' ? 'reactivada' : 'suspendida'}`);
            load();
        } catch (e) {
            notify(e.message, "err");
        }
    };

    const openCreate = () => { setEditData(null); setModalOpen(true); };
    const openEdit = (c) => { setEditData(c); setModalOpen(true); };
    const openRenew = (c) => { setRenewCompany(c); setRenewModalOpen(true); };

    // Helper de cálculo de vencimiento y días restantes
    const getRemainingDaysInfo = (c) => {
        if (!c.expires_at) {
            return {
                label: "Ilimitado",
                days: Infinity,
                badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                statusText: "Vigencia Ilimitada"
            };
        }

        const now = new Date();
        const exp = new Date(c.expires_at);
        // Reset hours for clean date math
        now.setHours(0, 0, 0, 0);
        const expClean = new Date(exp);
        expClean.setHours(0, 0, 0, 0);

        const diffTime = expClean.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (c.subscription_status === 'Suspendida') {
            return {
                label: "Suspendida",
                days: diffDays,
                badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
                statusText: "Cuenta Suspendida"
            };
        }

        if (diffDays < 0) {
            return {
                label: `Vencida (${Math.abs(diffDays)}d)`,
                days: diffDays,
                badgeClass: "bg-red-500/10 text-red-500 border-red-500/30",
                statusText: `Vencida hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? 's' : ''}`
            };
        }
        if (diffDays === 0) {
            return {
                label: "¡Vence Hoy!",
                days: 0,
                badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/30 animate-pulse",
                statusText: "¡Vence el día de hoy!"
            };
        }
        if (diffDays <= 7) {
            return {
                label: `${diffDays} día${diffDays !== 1 ? 's' : ''} rest.`,
                days: diffDays,
                badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/30",
                statusText: `Vence en ${diffDays} día${diffDays !== 1 ? 's' : ''}`
            };
        }
        return {
            label: `${diffDays} días rest.`,
            days: diffDays,
            badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/30",
            statusText: `Vence el ${exp.toLocaleDateString()}`
        };
    };

    // Métricas KPI de Suscripciones
    const kpis = useMemo(() => {
        let activeCount = 0;
        let demoCount = 0;
        let expiringCount = 0;
        let expiredOrSuspendedCount = 0;

        companies.forEach(c => {
            const info = getRemainingDaysInfo(c);
            if (c.subscription_status === 'Suspendida' || c.subscription_status === 'Vencida' || info.days < 0) {
                expiredOrSuspendedCount++;
            } else if (c.subscription_status === 'Demo') {
                demoCount++;
                if (info.days >= 0 && info.days <= 7) expiringCount++;
            } else if (c.subscription_status === 'Activa' || c.subscription_status === 'Ilimitado') {
                activeCount++;
                if (info.days >= 0 && info.days <= 7) expiringCount++;
            }
        });

        return { activeCount, demoCount, expiringCount, expiredOrSuspendedCount };
    }, [companies]);

    // Filtrado de la lista
    const filtered = useMemo(() => {
        return companies.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                                  c.tax_id?.toLowerCase().includes(search.toLowerCase());
            if (!matchesSearch) return false;

            if (activeTab === "subscriptions") {
                const info = getRemainingDaysInfo(c);
                if (subFilter === "active") return c.subscription_status === "Activa" || c.subscription_status === "Ilimitado";
                if (subFilter === "demo") return c.subscription_status === "Demo";
                if (subFilter === "expiring") return info.days >= 0 && info.days <= 7 && c.subscription_status !== "Suspendida";
                if (subFilter === "expired") return info.days < 0 || c.subscription_status === "Vencida";
                if (subFilter === "suspended") return c.subscription_status === "Suspendida";
            }
            return true;
        });
    }, [companies, search, activeTab, subFilter]);

    return (
        <div className="h-full flex flex-col bg-transparent animate-in fade-in duration-500">
            {/* Header / Tabs */}
            <div className="shrink-0 px-4 pt-3 pb-0 border-b border-border/30 dark:border-white/5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Administración</div>
                        <h1 className="text-sm font-black uppercase tracking-tight text-content dark:text-white">Gestión de Empresas y Licencias</h1>
                    </div>
                    <Button onClick={openCreate} className="h-8 px-3 text-[10px] shadow-none">
                        + Nueva Empresa
                    </Button>
                </div>

                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab("general")}
                        className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all ${
                            activeTab === "general"
                                ? "border-brand-500 text-brand-500"
                                : "border-transparent text-content-subtle hover:text-content"
                        }`}
                    >
                        Listado General
                    </button>
                    <button
                        onClick={() => setActiveTab("subscriptions")}
                        className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === "subscriptions"
                                ? "border-brand-500 text-brand-500"
                                : "border-transparent text-content-subtle hover:text-content"
                        }`}
                    >
                        <span>Suscripciones</span>
                        {kpis.expiringCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                        )}
                    </button>
                </div>
            </div>

            {/* Sub-header métricas para Pestaña de Suscripciones */}
            {activeTab === "subscriptions" && (
                <div className="shrink-0 p-4 border-b border-border/20 dark:border-white/5 bg-surface-2/40 dark:bg-white/[0.01]">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="card-premium p-3 border border-emerald-500/20 bg-emerald-500/[0.02]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Empresas Activas</div>
                            <div className="text-xl font-black tabular-nums text-content dark:text-white mt-1">{kpis.activeCount}</div>
                        </div>
                        <div className="card-premium p-3 border border-amber-500/20 bg-amber-500/[0.02]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-500">En Período Demo</div>
                            <div className="text-xl font-black tabular-nums text-content dark:text-white mt-1">{kpis.demoCount}</div>
                        </div>
                        <div className="card-premium p-3 border border-amber-500/30 bg-amber-500/[0.04]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 flex items-center justify-between">
                                <span>Por Vencer (≤7d)</span>
                                {kpis.expiringCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500"></span>}
                            </div>
                            <div className="text-xl font-black tabular-nums text-content dark:text-white mt-1">{kpis.expiringCount}</div>
                        </div>
                        <div className="card-premium p-3 border border-red-500/20 bg-red-500/[0.02]">
                            <div className="text-[9px] font-black uppercase tracking-widest text-red-500">Vencidas / Suspendidas</div>
                            <div className="text-xl font-black tabular-nums text-content dark:text-white mt-1">{kpis.expiredOrSuspendedCount}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Barra de Filtros & Búsqueda */}
            <div className="shrink-0 px-4 py-3 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input h-9 pl-9 text-[11px] w-full"
                        placeholder="Filtrar por nombre o RIF..."
                    />
                </div>

                {activeTab === "subscriptions" && (
                    <div className="flex items-center gap-1 overflow-x-auto">
                        <button
                            onClick={() => setSubFilter("all")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "all" ? "bg-brand-500 text-white border-brand-500" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Todas
                        </button>
                        <button
                            onClick={() => setSubFilter("active")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "active" ? "bg-emerald-500 text-white border-emerald-500" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Activas
                        </button>
                        <button
                            onClick={() => setSubFilter("demo")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "demo" ? "bg-amber-500 text-white border-amber-500" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Demo
                        </button>
                        <button
                            onClick={() => setSubFilter("expiring")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "expiring" ? "bg-amber-600 text-white border-amber-600" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Por Vencer
                        </button>
                        <button
                            onClick={() => setSubFilter("expired")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "expired" ? "bg-red-500 text-white border-red-500" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Vencidas
                        </button>
                        <button
                            onClick={() => setSubFilter("suspended")}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                                subFilter === "suspended" ? "bg-purple-600 text-white border-purple-600" : "bg-surface-2 dark:bg-white/5 text-content-subtle border-border/40"
                            }`}
                        >
                            Suspendidas
                        </button>
                    </div>
                )}

                <div className="shrink-0 text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
                    {filtered.length} empresa{filtered.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Contenido / Tabla */}
            <div className="flex-1 overflow-auto p-4 content-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 animate-pulse">
                        Sincronizando con el servidor…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20">
                            No se encontraron resultados
                        </div>
                    </div>
                ) : activeTab === "general" ? (
                    /* VISTA LISTADO GENERAL */
                    <div className="card-premium overflow-auto">
                        <table className="table-pos min-w-[680px]">
                            <thead>
                                <tr>
                                    <th className="text-left w-16">#</th>
                                    <th className="text-left">Empresa / RIF</th>
                                    <th className="text-left">Plan / Vencimiento</th>
                                    <th className="text-center">Estado</th>
                                    <th className="text-right w-[120px] pr-6">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {filtered.map(c => (
                                    <tr key={c.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td>
                                            <span className="text-[10px] font-black font-mono text-content-subtle tabular-nums">#{String(c.id).padStart(3, '0')}</span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-[11px] font-black text-brand-500 uppercase shrink-0">
                                                    {c.name?.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{c.name}</span>
                                                    <span className="text-[10px] font-bold text-content-subtle tabular-nums uppercase tracking-wider mt-0.5">RIF: {c.tax_id || "N/A"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col gap-1">
                                                <span className="badge badge-info shadow-none w-fit">
                                                    {c.plan_name || "Básico"}
                                                </span>
                                                <span className="text-[10px] font-bold text-content-subtle tabular-nums">
                                                    Vence: {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Ilimitado"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <span className={`badge shadow-none ${c.subscription_status === 'Activa' || c.subscription_status === 'Ilimitado' ? 'badge-success' : c.subscription_status === 'Demo' ? 'badge-warning' : 'badge-danger'}`}>
                                                {c.subscription_status || 'Demo'}
                                            </span>
                                        </td>
                                        <td className="text-right pr-6">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => openRenew(c)}
                                                    className="p-1.5 hover:bg-brand-500/10 rounded-xl transition-all text-content-subtle hover:text-brand-500 active:scale-90"
                                                    title="Renovar / Gestionar Suscripción"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => openEdit(c)}
                                                    className="p-1.5 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning active:scale-90"
                                                    title="Editar Datos"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* VISTA PANEL DE SUSCRIPCIONES Y VENCIMIENTOS */
                    <div className="card-premium overflow-auto">
                        <table className="table-pos min-w-[760px]">
                            <thead>
                                <tr>
                                    <th className="text-left w-12">#</th>
                                    <th className="text-left">Empresa</th>
                                    <th className="text-left">Plan / Límite</th>
                                    <th className="text-center">Estado Licencia</th>
                                    <th className="text-left">Días Restantes / Vencimiento</th>
                                    <th className="text-right pr-6">Acción Rápida</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {filtered.map(c => {
                                    const info = getRemainingDaysInfo(c);
                                    return (
                                        <tr key={c.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                            <td>
                                                <span className="text-[10px] font-black font-mono text-content-subtle tabular-nums">#{String(c.id).padStart(3, '0')}</span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-[11px] font-black text-brand-500 uppercase shrink-0">
                                                        {c.name?.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{c.name}</span>
                                                        <span className="text-[10px] font-bold text-content-subtle tabular-nums uppercase tracking-wider mt-0.5">RIF: {c.tax_id || "N/A"}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-xs font-black text-content dark:text-white uppercase">
                                                        {c.plan_name || "Básico"}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-content-subtle tabular-nums">
                                                        {c.max_users === 0 ? "Usuarios Ilimitados" : `Hasta ${c.max_users || 5} usuarios`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                <span className={`inline-block px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
                                                    c.subscription_status === 'Activa' || c.subscription_status === 'Ilimitado'
                                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                        : c.subscription_status === 'Demo'
                                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                        : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                }`}>
                                                    {c.subscription_status || 'Demo'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg border tabular-nums ${info.badgeClass}`}>
                                                        {info.label}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-content-subtle hidden sm:inline">
                                                        {info.statusText}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-right pr-6">
                                                <div className="flex justify-end items-center gap-2">
                                                    <button
                                                        onClick={() => handleToggleStatus(c)}
                                                        className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase transition-all border ${
                                                            c.subscription_status === 'Suspendida'
                                                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500 hover:text-white'
                                                                : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500 hover:text-white'
                                                        }`}
                                                        title={c.subscription_status === 'Suspendida' ? 'Reactivar Empresa' : 'Suspender Acceso'}
                                                    >
                                                        {c.subscription_status === 'Suspendida' ? 'Reactivar' : 'Suspender'}
                                                    </button>
                                                    <Button
                                                        onClick={() => openRenew(c)}
                                                        className="h-7 px-2.5 text-[10px] shadow-none"
                                                    >
                                                        Renovar +
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            {/* Modal Crear / Editar General */}
            <CompanyModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                editData={editData}
                loading={saving}
            />

            {/* Modal Renovar Suscripción */}
            <SubscriptionRenewModal
                open={renewModalOpen}
                onClose={() => { setRenewModalOpen(false); setRenewCompany(null); }}
                onSave={handleRenewSave}
                company={renewCompany}
                loading={renewing}
            />

            {/* Modal de Credenciales */}
            <Modal open={!!credentialsModal} onClose={() => setCredentialsModal(null)} title="¡Empresa Creada Exitosamente!" width={400}>
                {credentialsModal && (
                    <div className="space-y-4 py-2">
                        <p className="text-[12px] text-content-subtle dark:text-white/70">
                            Se ha generado un usuario administrador asociado a <strong>{credentialsModal.companyName}</strong>.
                            Por favor, copia estas credenciales y envíaselas al propietario.
                        </p>
                        
                        <div className="bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl p-4 space-y-3">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-1 block">Usuario / Email</label>
                                <div className="font-mono text-[13px] font-bold bg-white dark:bg-black/20 p-2 rounded-lg border border-border/50 dark:border-white/5 select-all">
                                    {credentialsModal.username}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-1 block">Contraseña</label>
                                <div className="font-mono text-[13px] font-bold bg-white dark:bg-black/20 p-2 rounded-lg border border-border/50 dark:border-white/5 select-all">
                                    {credentialsModal.password}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <Button onClick={() => setCredentialsModal(null)}>Entendido</Button>
                        </div>
                    </div>
                )}
            </Modal>

            <div className="shrink-0 px-6 py-3 border-t border-border/20 dark:border-white/5 bg-surface-2 dark:bg-white/[0.02] flex justify-end items-center">
                <span className="text-[9px] font-black text-content-subtle dark:text-white/20 uppercase tracking-[0.2em]">
                    Control de Acceso SuperUsuario v1.0
                </span>
            </div>

        </div>
    );
}

