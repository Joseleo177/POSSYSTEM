import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import { Button } from "./ui/Button";
import Modal from "./ui/Modal";
import ConfirmModal from "./ui/ConfirmModal";
import CustomSelect from "./ui/CustomSelect";
import Check from "./ui/Check";
import StatusMark, { ACTIVE_STATUS } from "./ui/StatusMark";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon, ICONS } from "./ui/Ledger";
import { useApp } from "../context/AppContext";
import { toNameCase } from "../helpers";

const EMPTY = { username: "", password: "", full_name: "", email: "", phone: "", role_id: "", warehouse_ids: [] };

const TABS = [
    { id: "employees", label: "Empleados" },
    { id: "roles",     label: "Roles y permisos" },
];

export default function EmployeesTab({ notify }) {
    const { employee: me } = useApp();
    // Solo el admin reparte permisos entre roles; un encargado gestiona personas, no llaves.
    const iAmAdmin = !!me?.permissions?.all;
    const [activeTab, setActiveTab] = useState("employees");
    const [warehouses, setWarehouses] = useState([]);
    // Módulos y acciones tal como los publica el backend: la matriz se dibuja con esto.
    const [catalog, setCatalog] = useState([]);

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
            // La lista de almacenes ya viene recortada a los del usuario: un encargado solo
            // puede repartir su propia sucursal.
            const [eRes, rRes, wRes, pRes] = await Promise.all([
                api.employees.getAll(),
                api.employees.getRoles(),
                api.warehouses.getAll(),
                api.employees.getPermissionCatalog(),
            ]);
            setEmployees(eRes.data);
            setRoles(rRes.data);
            setWarehouses(wRes.data || []);
            setCatalog(pRes.data || []);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => {
        setForm(EMPTY); setEditId(null); setModal(true);
        setTimeout(() => nameRef.current?.focus(), 80);
    };
    const openEdit = (e) => {
        setForm({ username: e.username, password: "", full_name: e.full_name, email: e.email || "", phone: e.phone || "", role_id: e.role_id, active: e.active, warehouse_ids: (e.warehouses || []).map(w => w.id) });
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
        // El input lleva la clase ``, que es solo CSS: se ve en mayúsculas pero
        // el valor viaja tal cual se tecleó. Se normaliza aquí para que también cubra
        // pegado, autocompletado del navegador y la edición de un empleado existente.
        const payload = { ...form, full_name: form.full_name.trim().toUpperCase() };
        try {
            if (editId) { await api.employees.update(editId, payload); notify("Empleado actualizado correctamente"); }
            else        { await api.employees.create(payload);          notify("Empleado creado correctamente"); }
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
    // Rol cuya matriz se está editando. Los cambios se llevan en rolePerms; si se cancela,
    // se restauran desde el rol para no dejar marcas a medias en pantalla.
    const [permRole, setPermRole] = useState(null);

    const openPerms = (role) => setPermRole(role);
    const cancelPerms = () => {
        if (permRole) {
            setRolePerms(prev => ({ ...prev, [permRole.id]: permRole.permissions ?? {} }));
        }
        setPermRole(null);
    };

    useEffect(() => {
        const map = {};
        roles.forEach(r => { map[r.id] = r.permissions ?? {}; });
        setRolePerms(map);
    }, [roles]);

    // Marca o desmarca todas las acciones de un módulo de una vez: con 46 casillas, ir una
    // por una para dar "acceso completo a Ventas" es donde se cometen los errores.
    const toggleModule = (roleId, mod) => {
        const keys = mod.actions.map(a => `${mod.key}.${a.key}`);
        const todas = keys.every(k => rolePerms[roleId]?.[k]);
        setRolePerms(prev => {
            const next = { ...(prev[roleId] || {}) };
            for (const k of keys) { if (todas) delete next[k]; else next[k] = true; }
            return { ...prev, [roleId]: next };
        });
    };

    const togglePerm = (roleId, key) => {
        setRolePerms(prev => ({
            ...prev,
            [roleId]: { ...prev[roleId], [key]: !prev[roleId]?.[key] },
        }));
    };

    const saveRole = async (role) => {
        setSavingRole(role.id);
        try {
            // Solo las claves granulares: los permisos viejos siguen en la base como respaldo
            // de la migración, y reenviarlos volvería a conceder todo lo que se acaba de quitar.
            const soloNuevos = Object.fromEntries(
                Object.entries(rolePerms[role.id] || {}).filter(([k, v]) => v && k.includes("."))
            );
            await api.employees.updateRole(role.id, { permissions: soloNuevos });
            notify(`Permisos de "${role.label}" actualizados`);
            await load();
            return true;
        } catch (e) { notify(e.message, "err"); return false; }
        finally { setSavingRole(null); }
    };

    // ── Sub-header: tabs (patrón CatalogPage) ────────────────
    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5">
            {TABS.filter(t => t.id !== "roles" || iAmAdmin).map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                        "px-4 py-2 text-[13px] font-semibold border-b-2 transition-all",
                        activeTab === tab.id
                            ? "border-brand-500 text-brand-700 dark:text-brand-300"
                            : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white",
                    ].join(" ")}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );

    const iniciales = (nombre) => (nombre || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    const sucursalesDe = (e) => {
        const ws = e.warehouses || [];
        if (ws.length === 0) return "—";
        if (ws.length <= 2) return ws.map(w => toNameCase(w.name)).join(", ");
        return `${ws.length} sucursales`;
    };
    const toggleWarehouse = (id) => setForm(p => {
        const cur = p.warehouse_ids || [];
        return { ...p, warehouse_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });

    const avatar = (e) => (
        <span className="w-9 h-9 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 text-[12px] font-semibold flex items-center justify-center shrink-0">
            {iniciales(e.full_name)}
        </span>
    );
    // Acciones siempre a la vista: en una tablet no hay hover que las descubra.
    const acciones = (e) => (
        <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
            <RowIcon icon="edit" title="Editar empleado" onClick={() => openEdit(e)} />
            <RowIcon icon="trash" tone="danger" title="Eliminar empleado" onClick={() => setDeleteConfirm(e)} />
        </div>
    );

    return (
        <Page
            module="Personal"
            title="Empleados"
            subheader={subheader}
            actions={activeTab === "employees" ? (
                <Button onClick={openNew}>
                    + <span className="hidden sm:inline">Nuevo empleado</span><span className="sm:hidden">Nuevo</span>
                </Button>
            ) : null}
        >
            {/* ── Sección Empleados ── */}
            {activeTab === "employees" && (
                <>
                    {/* Libro (escritorio) */}
                    <div className="hidden md:block card-premium overflow-auto flex-1">
                        <table className="table-ledger min-w-[760px]">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="pl-4">Empleado</th>
                                    <th>Rol</th>
                                    <th>Sucursales</th>
                                    <th>Contacto</th>
                                    <th>Estado</th>
                                    <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <LedgerEmpty cols={6} title="Sin empleados" hint="Agrega a las personas que van a usar el sistema." />
                                ) : employees.map(e => (
                                    <tr key={e.id} {...ledgerRow(() => openEdit(e))}>
                                        <td className="pl-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {avatar(e)}
                                                <div className="min-w-0">
                                                    <div className={`text-[13px] font-semibold truncate ${e.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(e.full_name)}</div>
                                                    <div className="text-[12px] text-content-subtle truncate">@{e.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span className="text-[13px] text-content dark:text-white whitespace-nowrap">{e.role_label || "—"}</span></td>
                                        <td className="max-w-0">
                                            <span className="block text-[13px] text-content-subtle truncate" title={(e.warehouses || []).map(w => w.name).join(", ") || undefined}>
                                                {sucursalesDe(e)}
                                            </span>
                                        </td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] text-content dark:text-white truncate">
                                                {e.email || <span className="text-content-subtle">Sin correo</span>}
                                            </div>
                                            {e.phone && <div className="text-[12px] text-content-subtle tabular-nums truncate">{e.phone}</div>}
                                        </td>
                                        <td><StatusMark status={e.active ? "activo" : "inactivo"} map={ACTIVE_STATUS} /></td>
                                        <td className="pr-4 whitespace-nowrap cursor-default">{acciones(e)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Tarjetas (teléfono) */}
                    <div className="md:hidden space-y-2 py-1">
                        {employees.length === 0 ? (
                            <div className="py-16 text-center px-6">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Sin empleados</div>
                                <div className="text-[13px] text-content-subtle mt-1">Agrega a las personas que van a usar el sistema.</div>
                            </div>
                        ) : employees.map(e => (
                            <div key={e.id} role="button" tabIndex={0}
                                onClick={() => openEdit(e)}
                                onKeyDown={ev => { if (ev.key === "Enter") openEdit(e); }}
                                className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-1.5 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform">
                                {avatar(e)}
                                <div className="min-w-0 flex-1">
                                    <div className={`text-[14px] font-semibold truncate ${e.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(e.full_name)}</div>
                                    <div className="text-[12px] text-content-subtle truncate">{e.role_label || "Sin rol"} · @{e.username}</div>
                                    {!e.active && <div className="mt-0.5"><StatusMark status="inactivo" map={ACTIVE_STATUS} /></div>}
                                </div>
                                {acciones(e)}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ── Sección Roles y Permisos ── */}
            {activeTab === "roles" && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start py-2">
                    {roles.map(role => {
                        const isAdmin = role.name === "admin";
                        const perms   = rolePerms[role.id] ?? {};
                        // Resumen por módulo: cuántas acciones de cada uno tiene concedidas.
                        // Es lo que permite entender un rol de un vistazo, sin abrirlo.
                        const resumen = catalog.map(mod => ({
                            key:   mod.key,
                            label: mod.label,
                            dadas: mod.actions.filter(a => perms[`${mod.key}.${a.key}`]).length,
                            total: mod.actions.length,
                        }));
                        const concedidas = resumen.reduce((a, m) => a + m.dadas, 0);
                        const totales    = resumen.reduce((a, m) => a + m.total, 0);
                        const pct        = totales ? Math.min(100, (concedidas / totales) * 100) : 0;
                        // Solo los módulos con algo concedido: lo que importa de un vistazo es qué SÍ puede.
                        const conAcceso  = resumen.filter(m => m.dadas > 0);

                        return (
                            <div key={role.id} className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none p-4 flex flex-col">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[15px] font-semibold text-content dark:text-white truncate">{role.label}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">
                                            {isAdmin ? "Todos los permisos" : `${concedidas} de ${totales} permisos`}
                                        </div>
                                    </div>
                                    {isAdmin && <StatusMark status="total" map={{ total: { label: "Acceso total", tone: "success", quiet: "check" } }} />}
                                </div>

                                {isAdmin ? (
                                    <p className="mt-3 text-[13px] text-content-subtle leading-relaxed flex-1">
                                        Puede hacer todo en el sistema. Este rol no se edita.
                                    </p>
                                ) : (
                                    <>
                                        <div className="mt-3 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                                            <div className="h-full rounded-full bg-content-subtle/50" style={{ width: `${pct}%` }} />
                                        </div>

                                        <ul className="mt-2 flex-1 divide-y divide-border/50 dark:divide-white/[0.05]">
                                            {conAcceso.length === 0 ? (
                                                <li className="py-2 text-[13px] text-content-subtle">Sin permisos asignados</li>
                                            ) : conAcceso.map(m => (
                                                <li key={m.key} className="py-1.5 flex items-center justify-between gap-3 text-[13px]">
                                                    <span className="text-content dark:text-white truncate">{m.label}</span>
                                                    {m.dadas === m.total ? (
                                                        <span className="shrink-0 inline-flex items-center gap-1 text-[12px] text-content-subtle">
                                                            <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            Completo
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 text-[12px] text-content-subtle tabular-nums">{m.dadas} de {m.total}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>

                                        <button
                                            onClick={() => openPerms(role)}
                                            className="btn-outline mt-4 h-10 w-full rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.edit} /></svg>
                                            Editar permisos
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal: matriz de permisos de un rol ──
                Cerrar con la X o con Escape descarta, igual que Cancelar: antes se cerraba sin
                restaurar y la tarjeta del rol quedaba mostrando permisos que no se guardaron. */}
            <Modal
                open={!!permRole}
                onClose={cancelPerms}
                title={permRole ? `Permisos · ${permRole.label}` : ""}
                width={720}
            >
                {permRole && (() => {
                    const perms = rolePerms[permRole.id] ?? {};
                    const concedidas = catalog.reduce((a, m) => a + m.actions.filter(x => perms[`${m.key}.${x.key}`]).length, 0);
                    const totales    = catalog.reduce((a, m) => a + m.actions.length, 0);
                    return (
                        <div>
                            <div className="flex items-baseline justify-between gap-3">
                                <p className="text-[13px] text-content-subtle">Qué puede hacer este rol en cada módulo.</p>
                                <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums shrink-0">
                                    {concedidas} <span className="font-normal text-content-subtle">de {totales}</span>
                                </span>
                            </div>
                            <div className="mt-2 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                                <div className="h-full rounded-full bg-content-subtle/50 transition-all" style={{ width: `${totales ? (concedidas / totales) * 100 : 0}%` }} />
                            </div>

                            {/* Sin scroll propio: el cuerpo del modal ya desplaza, y dos scrolls
                                anidados en el teléfono no se manejan. El pie queda fijo abajo. */}
                            <div className="mt-4 space-y-3">
                                {catalog.map(mod => {
                                    const keys  = mod.actions.map(a => `${mod.key}.${a.key}`);
                                    const dadas = keys.filter(k => perms[k]).length;
                                    const todas = dadas === keys.length;
                                    return (
                                        <section key={mod.key} className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                                            {/* La casilla del módulo marca o quita todas sus acciones de una
                                                vez: con 46 casillas, ir una por una es donde se cometen errores. */}
                                            <div
                                                role="presentation"
                                                onClick={() => toggleModule(permRole.id, mod)}
                                                className="px-3.5 py-2.5 flex items-center gap-3 bg-surface-2/60 dark:bg-white/[0.02] border-b border-border/60 dark:border-white/[0.06] cursor-pointer"
                                            >
                                                <Check checked={todas} onChange={() => toggleModule(permRole.id, mod)} title={todas ? "Quitar todo el módulo" : "Dar todo el módulo"} />
                                                <span className="flex-1 min-w-0 text-[13px] font-semibold text-content dark:text-white truncate">{mod.label}</span>
                                                <span className="shrink-0 text-[12px] text-content-subtle tabular-nums">{dadas} de {keys.length}</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 py-1">
                                                {mod.actions.map(act => {
                                                    const k = `${mod.key}.${act.key}`;
                                                    return (
                                                        <div
                                                            key={k}
                                                            role="presentation"
                                                            onClick={() => togglePerm(permRole.id, k)}
                                                            className="flex items-center gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-surface-2/70 dark:hover:bg-white/[0.025] transition-colors"
                                                        >
                                                            <Check checked={!!perms[k]} onChange={() => togglePerm(permRole.id, k)} title={act.label} />
                                                            <span className={`text-[13px] leading-tight ${perms[k] ? "text-content dark:text-white" : "text-content-subtle"}`}>
                                                                {act.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>

                            <div className="sticky bottom-0 -mx-6 -mb-6 mt-5 px-6 py-4 bg-white dark:bg-surface-dark-2 border-t border-border/60 dark:border-white/[0.06] flex justify-end gap-2">
                                <button onClick={cancelPerms} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                                <Button
                                    variant="primary"
                                    loading={savingRole === permRole.id}
                                    onClick={async () => { if (await saveRole(permRole)) setPermRole(null); }}
                                >
                                    Guardar permisos
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>


            {/* ── Modal crear / editar empleado ── */}
            <Modal open={modal} onClose={closeModal} title={editId ? "Editar empleado" : "Nuevo empleado"} width={540}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Campo label="Nombre completo">
                            <input
                                ref={nameRef}
                                value={form.full_name}
                                onChange={set("full_name")}
                                onKeyDown={e => { if (e.key === "Enter") save(); }}
                                autoComplete="name"
                                className={INPUT}
                                placeholder="Ej: Juan Pérez"
                            />
                        </Campo>
                        <Campo label="Usuario">
                            <input
                                value={form.username}
                                onChange={set("username")}
                                onKeyDown={e => { if (e.key === "Enter") save(); }}
                                autoComplete="username"
                                autoCapitalize="none"
                                className={INPUT}
                                placeholder="Ej: jperez"
                            />
                        </Campo>
                    </div>

                    <Campo label="Contraseña" hint={editId ? "Vacía, no se cambia" : "Mínimo 6 caracteres"}>
                        <input
                            value={form.password}
                            onChange={set("password")}
                            type="password"
                            autoComplete="new-password"
                            className={INPUT}
                            placeholder={editId ? "••••••••" : ""}
                        />
                    </Campo>

                    <Campo label="Rol">
                        <CustomSelect
                            value={form.role_id ?? ""}
                            onChange={v => setForm(p => ({ ...p, role_id: v }))}
                            options={roles.map(r => ({ value: r.id, label: r.label }))}
                            placeholder="Elegir rol…"
                            className="w-full"
                        />
                    </Campo>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Campo label="Teléfono" hint="Opcional">
                            <input
                                value={form.phone}
                                onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d\s+\-()]/g, "") }))}
                                inputMode="tel"
                                autoComplete="tel"
                                className={`${INPUT} tabular-nums`}
                                placeholder="+58 412…"
                            />
                        </Campo>
                        <Campo label="Correo" hint="Opcional">
                            <input
                                value={form.email}
                                onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase() }))}
                                type="email"
                                inputMode="email"
                                autoComplete="email"
                                className={INPUT}
                                placeholder="correo@…"
                            />
                        </Campo>
                    </div>

                    {/* Sucursales del empleado. Con una sola disponible no se pregunta: el
                        backend casa al usuario nuevo con la sucursal de quien lo crea, que es
                        la única que hay. */}
                    {warehouses.length > 1 && (
                        <div>
                            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                                <span className={LABEL}>Sucursales con acceso</span>
                                <span className="text-[11px] text-content-subtle/70 tabular-nums">
                                    {(form.warehouse_ids || []).length} de {warehouses.length}
                                </span>
                            </p>
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                {warehouses.map(w => {
                                    const on = (form.warehouse_ids || []).includes(w.id);
                                    return (
                                        <div
                                            key={w.id}
                                            role="presentation"
                                            onClick={() => toggleWarehouse(w.id)}
                                            className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-surface-2/70 dark:hover:bg-white/[0.025] transition-colors"
                                        >
                                            <Check checked={on} onChange={() => toggleWarehouse(w.id)} title={w.name} />
                                            <span className={`text-[13px] truncate ${on ? "font-medium text-content dark:text-white" : "text-content-muted dark:text-white/70"}`}>
                                                {toNameCase(w.name)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[12px] text-content-subtle mt-1.5">
                                Sin ninguna marcada, el empleado hereda las sucursales de quien lo crea.
                            </p>
                        </div>
                    )}

                    {editId && (
                        <div
                            role="presentation"
                            onClick={() => setForm(p => ({ ...p, active: !(p.active ?? true) }))}
                            className="flex items-start gap-3 rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3 cursor-pointer hover:bg-surface-2/70 dark:hover:bg-white/[0.025] transition-colors"
                        >
                            <Check checked={form.active ?? true} onChange={v => setForm(p => ({ ...p, active: v }))} title="Empleado activo" className="mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-content dark:text-white">Empleado activo</p>
                                <p className="text-[12px] text-content-subtle">
                                    {(form.active ?? true) ? "Puede iniciar sesión con su usuario." : "No puede iniciar sesión hasta que se reactive."}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <button onClick={closeModal} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} loading={loading}>
                        {editId ? "Guardar cambios" : "Crear empleado"}
                    </Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar empleado?"
                message={`¿Estás seguro de que deseas eliminar a ${toNameCase(deleteConfirm?.full_name)}? Esta acción no se puede deshacer.`}
                onConfirm={async () => { await del(deleteConfirm.id); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </Page>
    );
}

// ── helpers ──────────────────────────────────────────────────────────────────
const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Rótulo en caja de oración; lo opcional se dice a la derecha, sin asteriscos en lo obligatorio.
function Campo({ label, hint, children }) {
    return (
        <div className="min-w-0">
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}
