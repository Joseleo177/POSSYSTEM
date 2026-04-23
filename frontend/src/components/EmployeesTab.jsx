import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";
import Modal from "./ui/Modal";
import ConfirmModal from "./ui/ConfirmModal";
import { PERM_LABELS } from "../constants/tabs";

const EMPTY = { username: "", password: "", full_name: "", email: "", phone: "", role_id: "" };

const TABS = [
    { id: "employees", label: "Empleados" },
    { id: "roles",     label: "Roles y Permisos" },
];

export default function EmployeesTab({ notify }) {
    const [activeTab, setActiveTab] = useState("employees");

    // ── Employees ──────────────────────────────────────────────
    const [employees, setEmployees] = useState([]);
    const [roles, setRoles]         = useState([]);
    const [form, setForm]           = useState(EMPTY);
    const [editId, setEditId]       = useState(null);
    const [loading, setLoading]     = useState(false);
    const [modal, setModal]         = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const nameRef = useRef(null);

    const load = async () => {
        try {
            const [eRes, rRes] = await Promise.all([api.employees.getAll(), api.employees.getRoles()]);
            setEmployees(eRes.data);
            setRoles(rRes.data);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => {
        setForm(EMPTY); setEditId(null); setModal(true);
        setTimeout(() => nameRef.current?.focus(), 80);
    };
    const openEdit = (e) => {
        setForm({ username: e.username, password: "", full_name: e.full_name, email: e.email || "", phone: e.phone || "", role_id: e.role_id, active: e.active });
        setEditId(e.id); setModal(true);
        setTimeout(() => nameRef.current?.focus(), 80);
    };
    const closeModal = () => { setModal(false); setForm(EMPTY); setEditId(null); };

    const save = async () => {
        if (!form.full_name.trim() || !form.username.trim() || !form.role_id)
            return notify("Nombre, usuario y rol son requeridos", "err");
        if (!editId && !form.password)
            return notify("La contraseña es requerida para nuevos empleados", "err");
        setLoading(true);
        try {
            if (editId) { await api.employees.update(editId, form); notify("Empleado actualizado correctamente"); }
            else        { await api.employees.create(form);          notify("Empleado creado correctamente"); }
            closeModal(); await load();
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    };

    const del = async (id) => {
        try { await api.employees.remove(id); notify("Empleado eliminado"); await load(); }
        catch (e) { notify(e.message, "err"); }
    };

    const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

    // ── Roles ──────────────────────────────────────────────────
    const [rolePerms, setRolePerms] = useState({});
    const [savingRole, setSavingRole] = useState(null);

    useEffect(() => {
        const map = {};
        roles.forEach(r => { map[r.id] = r.permissions ?? {}; });
        setRolePerms(map);
    }, [roles]);

    const togglePerm = (roleId, key) => {
        setRolePerms(prev => ({
            ...prev,
            [roleId]: { ...prev[roleId], [key]: !prev[roleId]?.[key] },
        }));
    };

    const saveRole = async (role) => {
        setSavingRole(role.id);
        try {
            await api.employees.updateRole(role.id, { permissions: rolePerms[role.id] });
            notify(`Permisos de "${role.label}" actualizados`);
            await load();
        } catch (e) { notify(e.message, "err"); }
        finally { setSavingRole(null); }
    };

    // ── Sub-header: tabs (patrón CatalogPage) ────────────────
    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5">
            {TABS.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                        "px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all",
                        activeTab === tab.id
                            ? "border-brand-500 text-brand-500"
                            : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white",
                    ].join(" ")}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );

    return (
        <Page
            module="MÓDULO DE PERSONAL"
            title="Gestión de Empleados"
            subheader={subheader}
            actions={activeTab === "employees" ? (
                <Button onClick={openNew} className="h-8 px-4 text-[10px] font-black uppercase tracking-wide">
                    + Nuevo Empleado
                </Button>
            ) : null}
        >
            {/* ── Sección Empleados ── */}
            {activeTab === "employees" && (
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-pos">
                        <thead>
                            <tr>
                                <th className="text-left">Identificación</th>
                                <th className="text-left">Rol</th>
                                <th className="text-left">Contacto</th>
                                <th className="text-center">Estado</th>
                                <th className="text-right w-[140px] pr-6">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                            {employees.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-30">
                                            <svg className="w-10 h-10 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">No se han registrado empleados</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : employees.map(e => (
                                <tr key={e.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-[11px] font-black text-brand-500 uppercase shrink-0">
                                                {e.full_name?.charAt(0)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">{e.full_name}</span>
                                                <span className="text-[10px] font-bold text-content-subtle opacity-50 mt-0.5">@{e.username}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="badge badge-info shadow-none">{e.role_label}</span>
                                    </td>
                                    <td>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-bold text-content dark:text-content-dark">{e.email || "—"}</span>
                                            {e.phone && <span className="text-[10px] font-bold text-content-subtle opacity-50 tabular-nums">{e.phone}</span>}
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <span className={`badge shadow-none ${e.active ? "badge-success" : "badge-danger"}`}>
                                            {e.active ? "En Servicio" : "Inactivo"}
                                        </span>
                                    </td>
                                    <td className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(e)} className="p-2 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning active:scale-90" title="Editar">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <button onClick={() => setDeleteConfirm(e)} className="p-2 hover:bg-danger/10 rounded-xl transition-all text-content-subtle hover:text-danger active:scale-90" title="Eliminar">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Sección Roles y Permisos ── */}
            {activeTab === "roles" && (
                <div className="space-y-4 flex-1 overflow-auto">
                    {roles.map(role => {
                        const isAdmin = role.name === "admin";
                        const perms   = rolePerms[role.id] ?? {};
                        return (
                            <div key={role.id} className="card-premium p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="text-sm font-black text-content dark:text-white uppercase tracking-tight">{role.label}</div>
                                        <div className="text-[10px] font-bold text-content-subtle font-mono mt-0.5 opacity-50">{role.name}</div>
                                    </div>
                                    {isAdmin ? (
                                        <span className="badge badge-success text-[11px]">Acceso total</span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            loading={savingRole === role.id}
                                            onClick={() => saveRole(role)}
                                            className="h-8 px-4 text-[10px] font-black uppercase tracking-wide"
                                        >
                                            Guardar
                                        </Button>
                                    )}
                                </div>
                                {isAdmin ? (
                                    <p className="text-xs text-content-subtle">El rol Administrador tiene acceso total al sistema y no puede modificarse.</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {PERM_LABELS.map(({ key, label }) => (
                                            <label
                                                key={key}
                                                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                                                    perms[key]
                                                        ? "bg-brand-500/10 border-brand-500/30"
                                                        : "bg-surface-2 dark:bg-surface-dark-2 border-border/30 dark:border-white/5 hover:border-brand-500/20"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!perms[key]}
                                                    onChange={() => togglePerm(role.id, key)}
                                                    className="accent-brand-500 w-4 h-4 shrink-0"
                                                />
                                                <span className={`text-[11px] font-bold ${perms[key] ? "text-brand-600 dark:text-brand-400" : "text-content-subtle"}`}>
                                                    {label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal crear / editar empleado ── */}
            <Modal open={modal} onClose={closeModal} title={editId ? "Editar empleado" : "Nuevo empleado"} width={520}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="label mb-1.5 text-brand-500">Nombre completo <span className="text-danger">*</span></label>
                            <input
                                ref={nameRef}
                                value={form.full_name}
                                onChange={set("full_name")}
                                onKeyDown={e => { if (e.key === "Enter") save(); }}
                                autoComplete="name"
                                className="input h-10 font-bold uppercase"
                                placeholder="Ej: JUAN PÉREZ"
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="label mb-1.5 opacity-70">Usuario <span className="text-danger">*</span></label>
                            <input
                                value={form.username}
                                onChange={set("username")}
                                onKeyDown={e => { if (e.key === "Enter") save(); }}
                                autoComplete="username"
                                className="input h-10 font-bold"
                                placeholder="Ej: jperez"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label mb-1.5 opacity-70">
                            {editId ? "Contraseña (vacío = no cambiar)" : <>Contraseña <span className="text-danger">*</span></>}
                        </label>
                        <input
                            value={form.password}
                            onChange={set("password")}
                            type="password"
                            autoComplete={editId ? "new-password" : "new-password"}
                            className="input h-10 font-bold"
                            placeholder={editId ? "••••••••" : "Mínimo 6 caracteres"}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="label mb-1.5 opacity-70">Rol <span className="text-danger">*</span></label>
                            <select value={form.role_id} onChange={set("role_id")} className="input h-10 font-bold cursor-pointer">
                                <option value="">Seleccionar</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label mb-1.5 opacity-70">Teléfono</label>
                            <input
                                value={form.phone}
                                onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d\s+\-()]/g, "") }))}
                                inputMode="tel"
                                autoComplete="tel"
                                className="input h-10 font-bold tabular-nums"
                                placeholder="+58 412..."
                            />
                        </div>
                        <div>
                            <label className="label mb-1.5 opacity-70">Correo</label>
                            <input
                                value={form.email}
                                onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase() }))}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                className="input h-10 font-bold"
                                placeholder="email@..."
                            />
                        </div>
                    </div>

                    {editId && (
                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.active ? "bg-success/5 border-success/20" : "bg-surface-2 dark:bg-surface-dark-2 border-border/30 dark:border-white/5"}`}>
                            <input
                                type="checkbox"
                                checked={form.active ?? true}
                                onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                                className="accent-brand-500 w-4 h-4 shrink-0"
                            />
                            <div>
                                <div className={`text-[11px] font-black uppercase tracking-wide ${form.active ? "text-success" : "text-content-subtle"}`}>
                                    {form.active ? "Empleado activo" : "Empleado inactivo"}
                                </div>
                                <div className="text-[10px] text-content-subtle opacity-60 mt-0.5">
                                    {form.active ? "Puede iniciar sesión en el sistema" : "No puede acceder al sistema"}
                                </div>
                            </div>
                        </label>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-border/10 dark:border-white/5">
                    <Button variant="ghost" onClick={closeModal} className="h-10 px-6 font-black tracking-widest text-[10px] uppercase">
                        CANCELAR
                    </Button>
                    <Button onClick={save} loading={loading} className="h-10 px-8 shadow-xl font-black tracking-[0.2em] text-[10px] uppercase">
                        {editId ? "GUARDAR CAMBIOS" : "CREAR EMPLEADO"}
                    </Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar empleado?"
                message={`¿Estás seguro de que deseas eliminar a ${deleteConfirm?.full_name}? Esta acción no se puede deshacer.`}
                onConfirm={async () => { await del(deleteConfirm.id); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </Page>
    );
}
