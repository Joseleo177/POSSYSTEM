import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "../components/ui/Button";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import CompanyModal from "../components/Companies/CompanyModal";
import SubscriptionRenewModal from "../components/Companies/SubscriptionRenewModal";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Segmented from "../components/ui/Segmented";
import StatusMark, { statusTone } from "../components/ui/StatusMark";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowIcon, RowCta } from "../components/ui/Ledger";
import {
    LICENSE_STATUS, estadoLicencia, vencimientoRelativo, fmtFecha, TONO_TEXTO, usuariosTexto,
} from "../components/Companies/license";

// Empresas y licencias (solo superusuario).
//
// Antes eran dos pestañas que listaban las mismas empresas con columnas distintas, más cuatro
// tarjetas de colores con los conteos. Ahora es una lista: el estado de la licencia, el
// vencimiento y las acciones van en la misma fila, y los conteos viven en el filtro, que es
// donde se usan ("3 por vencer" → tocarlo y verlas).
const FILTROS = [
    { key: "todas",      label: "Todas" },
    { key: "activa",     label: "Activas" },
    { key: "demo",       label: "Demo" },
    { key: "por_vencer", label: "Por vencer" },
    { key: "vencida",    label: "Vencidas" },
    { key: "suspendida", label: "Suspendidas" },
];

// La empresa principal (id 1) es la del propio operador de la plataforma: no se borra ni se
// suspende, que sería dejar fuera a sus propios usuarios.
const esPrincipal = (c) => c.id === 1;

export default function CompaniesPage() {
    const { notify } = useApp();
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [filtro, setFiltro] = useState("todas");

    const [modalOpen, setModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [saving, setSaving] = useState(false);

    const [renewCompany, setRenewCompany] = useState(null);
    const [renewing, setRenewing] = useState(false);

    const [credentialsModal, setCredentialsModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [suspendDialog, setSuspendDialog] = useState(null);
    const [reactivating, setReactivating] = useState(null);

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
                notify("Empresa actualizada");
                setModalOpen(false);
            } else {
                const res = await api.companies.create(form);
                notify("Empresa creada");
                setModalOpen(false);
                if (res.company?.default_credentials) {
                    setCredentialsModal({ ...res.company.default_credentials, companyName: form.name });
                }
            }
            load();
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setSaving(false);
        }
    };

    const handleRenewSave = async (updated) => {
        setRenewing(true);
        try {
            await api.companies.update(updated.id, updated);
            notify(`Suscripción de "${updated.name}" actualizada`);
            setRenewCompany(null);
            load();
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setRenewing(false);
        }
    };

    const setStatus = async (company, status) => {
        try {
            await api.companies.update(company.id, { ...company, subscription_status: status });
            notify(`"${company.name}" ${status === "Activa" ? "reactivada" : "suspendida"}`);
            load();
        } catch (e) {
            notify(e.message, "err");
        }
    };

    // Reactivar no pide confirmación (devuelve el acceso, que es ir hacia el lado seguro);
    // suspender sí, porque deja fuera en el acto a todos los usuarios de esa empresa.
    const reactivate = async (c) => {
        setReactivating(c.id);
        try { await setStatus(c, "Activa"); } finally { setReactivating(null); }
    };

    const handleDeleteCompany = async () => {
        if (!deleteDialog) return;
        try {
            await api.companies.remove(deleteDialog.id);
            notify(`Empresa "${deleteDialog.name}" eliminada`);
            setDeleteDialog(null);
            load();
        } catch (e) {
            notify(e.message, "err");
        }
    };

    const openCreate = () => { setEditData(null); setModalOpen(true); };
    const openEdit = (c) => { setEditData(c); setModalOpen(true); };

    const conEstado = useMemo(() => companies.map(c => ({ ...c, _estado: estadoLicencia(c) })), [companies]);

    const conteos = useMemo(() => {
        const n = { todas: conEstado.length };
        for (const c of conEstado) n[c._estado] = (n[c._estado] || 0) + 1;
        return n;
    }, [conEstado]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return conEstado.filter(c => {
            if (filtro !== "todas" && c._estado !== filtro) return false;
            if (!q) return true;
            return c.name?.toLowerCase().includes(q) || c.tax_id?.toLowerCase().includes(q);
        });
    }, [conEstado, search, filtro]);

    // Lo que pide renovar: vencida, por vencer o en demo. Ahí "Renovar" es el botón con peso de
    // la fila; en el resto queda como icono, para no llenar la lista de botones iguales.
    const pideRenovar = (c) => ["vencida", "por_vencer", "demo"].includes(c._estado);

    const plan = (c) => (
        <>
            <div className="text-[13px] text-content dark:text-white">{c.plan_name || "Básico"}</div>
            <div className="text-[12px] text-content-subtle">
                {usuariosTexto(c.max_users)}{c.catalog_enabled ? " · Con catálogo" : ""}
            </div>
        </>
    );

    const vence = (c) => {
        if (!c.expires_at) return <div className="text-[13px] text-content-subtle">Sin vencimiento</div>;
        const rel = vencimientoRelativo(c.expires_at);
        return (
            <>
                <div className="text-[13px] text-content dark:text-white">{fmtFecha(c.expires_at)}</div>
                <div className={`text-[12px] ${rel.tone ? TONO_TEXTO[rel.tone] : "text-content-subtle"}`}>{rel.text}</div>
            </>
        );
    };

    const acciones = (c) => (
        <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
            {pideRenovar(c) && <RowCta onClick={() => setRenewCompany(c)}>Renovar</RowCta>}
            {!pideRenovar(c) && (
                <RowIcon icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    title="Renovar o cambiar plan" onClick={() => setRenewCompany(c)} />
            )}
            <RowIcon icon="edit" title="Editar datos" onClick={() => openEdit(c)} />
            {c._estado === "suspendida" ? (
                <RowIcon icon="power" title="Reactivar" busy={reactivating === c.id} onClick={() => reactivate(c)} />
            ) : !esPrincipal(c) && (
                <RowIcon icon="ban" title="Suspender acceso" tone="danger" onClick={() => setSuspendDialog(c)} />
            )}
            {!esPrincipal(c) && <RowIcon icon="trash" title="Eliminar empresa" tone="danger" onClick={() => setDeleteDialog(c)} />}
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-y-auto lg:overflow-hidden">
            {/* Cabecera */}
            <div className="shrink-0 px-4 pt-3 pb-3 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-brand-600 dark:text-brand-400 leading-none mb-1">Administración</div>
                    <h1 className="text-[17px] font-bold tracking-[-0.015em] leading-tight text-content dark:text-white truncate">Empresas y licencias</h1>
                </div>
                <Button onClick={openCreate} className="h-9 px-3.5 text-[13px] shadow-none shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                    <span className="hidden sm:inline">Nueva empresa</span><span className="sm:hidden">Nueva</span>
                </Button>
            </div>

            {/* Buscador y estado */}
            <div className="shrink-0 px-4 py-2.5 flex flex-col lg:flex-row lg:items-center gap-2 border-b border-border/20 dark:border-white/5">
                <div className="relative lg:w-72 shrink-0">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input h-9 pl-9 text-[13px] w-full"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Buscar por nombre o RIF…"
                    />
                </div>
                <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                    <Segmented
                        options={FILTROS.map(f => ({ ...f, count: conteos[f.key] || 0 }))}
                        value={filtro}
                        onChange={setFiltro}
                    />
                </div>
            </div>

            {/* ── Libro (escritorio) ── */}
            <div className="hidden md:flex lg:flex-1 lg:min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto lg:flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Empresa</th>
                                <th className="w-[210px]">Plan</th>
                                <th className="w-[150px]">Licencia</th>
                                <th className="w-[170px]">Vence</th>
                                <th className="w-[200px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && companies.length === 0 ? <LedgerSkeleton cols={5} rows={4} />
                                : filtered.length === 0 ? (
                                    <LedgerEmpty cols={5}
                                        title={companies.length ? "Ninguna empresa coincide" : "Todavía no hay empresas"}
                                        hint={companies.length ? "Prueba con otro nombre o con otro estado." : "Crea la primera con Nueva empresa."}
                                        onClear={search || filtro !== "todas" ? () => { setSearch(""); setFiltro("todas"); } : undefined} />
                                ) : filtered.map(c => (
                                    <tr key={c.id} {...ledgerRow(() => openEdit(c), statusTone(c._estado, LICENSE_STATUS))}>
                                        <td className="pl-4">
                                            <div className="text-[13px] font-semibold text-content dark:text-white">{c.name}</div>
                                            <div className="text-[12px] text-content-subtle">{c.tax_id ? `RIF ${c.tax_id}` : "Sin RIF"}</div>
                                        </td>
                                        <td>{plan(c)}</td>
                                        <td><StatusMark status={c._estado} map={LICENSE_STATUS} /></td>
                                        <td>{vence(c)}</td>
                                        <td className="pr-4">{acciones(c)}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Tarjetas (móvil) ── */}
            <div className="md:hidden px-4 py-3 space-y-2">
                {loading && companies.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-content-subtle">Cargando…</p>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-[14px] font-semibold text-content dark:text-white">
                            {companies.length ? "Ninguna empresa coincide" : "Todavía no hay empresas"}
                        </p>
                        <p className="text-[12px] text-content-subtle mt-1">
                            {companies.length ? "Prueba con otro nombre o con otro estado." : "Crea la primera con Nueva."}
                        </p>
                    </div>
                ) : filtered.map(c => {
                    const tone = statusTone(c._estado, LICENSE_STATUS);
                    const rel = vencimientoRelativo(c.expires_at);
                    return (
                        <div key={c.id} role="button" tabIndex={0} onClick={() => openEdit(c)}
                            onKeyDown={e => { if (e.key === "Enter") openEdit(c); }}
                            style={tone ? { boxShadow: `inset 3px 0 0 ${tone}` } : undefined}
                            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[14px] font-semibold text-content dark:text-white truncate">{c.name}</span>
                                <StatusMark status={c._estado} map={LICENSE_STATUS} />
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3 text-[12px]">
                                <span className="text-content-subtle truncate">{c.plan_name || "Básico"} · {usuariosTexto(c.max_users)}</span>
                                <span className={`whitespace-nowrap ${rel.tone ? TONO_TEXTO[rel.tone] : "text-content-subtle"}`}>{rel.text}</span>
                            </div>
                            <div className="mt-2.5 flex items-center justify-end">{acciones(c)}</div>
                        </div>
                    );
                })}
            </div>

            <CompanyModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSave}
                editData={editData}
                loading={saving}
            />

            <SubscriptionRenewModal
                open={!!renewCompany}
                onClose={() => setRenewCompany(null)}
                onSave={handleRenewSave}
                company={renewCompany}
                loading={renewing}
            />

            {/* Credenciales del administrador recién creado: se muestran una sola vez. */}
            <Modal open={!!credentialsModal} onClose={() => setCredentialsModal(null)} title="Empresa creada" width={420}>
                {credentialsModal && (
                    <div className="space-y-4">
                        <p className="text-[13px] text-content-subtle leading-relaxed">
                            Se creó el usuario administrador de <span className="font-semibold text-content dark:text-white">{credentialsModal.companyName}</span>.
                            Cópialo ahora y envíaselo al dueño: la contraseña no se vuelve a mostrar.
                        </p>
                        <dl className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {[["Usuario", credentialsModal.username], ["Contraseña", credentialsModal.password]].map(([k, v]) => (
                                <div key={k} className="px-4 py-3 flex items-center justify-between gap-3">
                                    <dt className="text-[12px] text-content-subtle">{k}</dt>
                                    <dd className="text-[14px] font-semibold text-content dark:text-white select-all break-all text-right">{v}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`Empresa: ${credentialsModal.companyName}\nUsuario: ${credentialsModal.username}\nContraseña: ${credentialsModal.password}`);
                                    notify("Credenciales copiadas");
                                }}
                                className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Copiar
                            </button>
                            <Button onClick={() => setCredentialsModal(null)} className="h-12 sm:h-10 px-5 text-[13px]">Listo</Button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!suspendDialog}
                onCancel={() => setSuspendDialog(null)}
                onConfirm={async () => { await setStatus(suspendDialog, "Suspendida"); setSuspendDialog(null); }}
                title="¿Suspender el acceso?"
                message={`Todos los usuarios de "${suspendDialog?.name}" quedarán fuera del sistema hasta que la reactives. No se borra nada.`}
                confirmText="Suspender"
                type="danger"
            />

            <ConfirmModal
                isOpen={!!deleteDialog}
                onCancel={() => setDeleteDialog(null)}
                onConfirm={handleDeleteCompany}
                title="¿Eliminar la empresa?"
                message={`Se borra "${deleteDialog?.name}" con todos sus empleados, productos, ventas, inventario y registros. No se puede deshacer.`}
                confirmText="Eliminar empresa"
                type="danger"
            />
        </div>
    );
}
