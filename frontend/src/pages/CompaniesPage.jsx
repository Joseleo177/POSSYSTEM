import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/ui/Button";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import CompanyModal from "../components/Companies/CompanyModal";
import Modal from "../components/ui/Modal";

export default function CompaniesPage() {
    const { notify, can } = useApp();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    
    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [saving, setSaving] = useState(false);
    
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

    const openCreate = () => { setEditData(null); setModalOpen(true); };
    const openEdit = (c) => { setEditData(c); setModalOpen(true); };

    const filtered = companies.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.tax_id?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-transparent animate-in fade-in duration-500">
            <div className="shrink-0 px-4 pt-3 pb-0 border-b border-border/30 dark:border-white/5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Administración</div>
                        <h1 className="text-sm font-black uppercase tracking-tight text-content dark:text-white">Gestión de Empresas</h1>
                    </div>
                    <Button onClick={openCreate} className="h-8 px-3 text-[10px] shadow-none">
                        + Nueva Empresa
                    </Button>
                </div>

                <div className="flex gap-1">
                    <button className="px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 border-brand-500 text-brand-500 transition-all">
                        Listado General
                    </button>
                    <button className="px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 border-transparent text-content-subtle dark:text-white/30 hover:text-content transition-all opacity-40 cursor-not-allowed">
                        Suscripciones
                    </button>
                </div>
            </div>

            <div className="shrink-0 px-4 py-3 border-b border-border/20 dark:border-white/5 flex items-center gap-3">
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
                <div className="shrink-0 text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
                    {filtered.length} empresa{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
                </div>
            </div>

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
                ) : (
                    <div className="card-premium overflow-hidden">
                        <table className="table-pos">
                            <thead>
                                <tr>
                                    <th className="text-left w-16">#</th>
                                    <th className="text-left">Empresa / RIF</th>
                                    <th className="text-left">Plan / Vencimiento</th>
                                    <th className="text-center">Estado</th>
                                    <th className="text-right w-[100px] pr-6">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {filtered.map(c => (
                                    <tr key={c.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td>
                                            <span className="text-[10px] font-black font-mono text-content-subtle opacity-50 tabular-nums">#{String(c.id).padStart(3, '0')}</span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-[11px] font-black text-brand-500 uppercase shrink-0">
                                                    {c.name?.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{c.name}</span>
                                                    <span className="text-[10px] font-bold text-content-subtle opacity-50 tabular-nums uppercase tracking-wider mt-0.5">RIF: {c.tax_id || "N/A"}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col gap-1">
                                                <span className="badge badge-info shadow-none w-fit">
                                                    {c.plan_name || "Básico"}
                                                </span>
                                                <span className="text-[10px] font-bold text-content-subtle opacity-50 tabular-nums">
                                                    Vence: {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Ilimitado"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <span className={`badge shadow-none ${c.subscription_status === 'Activa' || c.subscription_status === 'Ilimitado' ? 'badge-success' : 'badge-warning'}`}>
                                                {c.subscription_status || 'Demo'}
                                            </span>
                                        </td>
                                        <td className="text-right pr-6">
                                            <button
                                                onClick={() => openEdit(c)}
                                                className="p-2 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning active:scale-90"
                                                title="Editar"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            <CompanyModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                editData={editData}
                loading={saving}
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
