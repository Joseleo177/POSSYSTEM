import { useState, useEffect } from "react";
import { api } from "../services/api";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";

const EMPTY = { username: "", password: "", full_name: "", email: "", phone: "", role_id: "" };

const ROLE_BADGE = {
  admin:     "badge-danger",
  manager:   "badge-warning",
  cashier:   "badge-success",
  warehouse: "badge-info",
};

export default function EmployeesTab({ notify }) {
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles]         = useState([]);
  const [form, setForm]           = useState(EMPTY);
  const [editId, setEditId]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [modal, setModal]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    try {
      const [eRes, rRes] = await Promise.all([api.employees.getAll(), api.employees.getRoles()]);
      setEmployees(eRes.data);
      setRoles(rRes.data);
    } catch (e) { notify(e.message, "err"); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditId(null); setModal(true); };
  const openEdit = (e) => {
    setForm({ username: e.username, password: "", full_name: e.full_name, email: e.email || "", phone: e.phone || "", role_id: e.role_id, active: e.active });
    setEditId(e.id);
    setModal(true);
  };
  const closeModal = () => { setModal(false); setForm(EMPTY); setEditId(null); };

  const save = async () => {
    if (!form.full_name || !form.username || !form.role_id)
      return notify("Nombre, usuario y rol son requeridos", "err");
    if (!editId && !form.password)
      return notify("La contraseña es requerida para nuevos empleados", "err");
    setLoading(true);
    try {
      if (editId) { await api.employees.update(editId, form); notify("Empleado actualizado correctamente"); }
      else        { await api.employees.create(form); notify("Empleado creado correctamente"); }
      closeModal(); await load();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const del = async (id) => {
    try { await api.employees.remove(id); notify("Empleado eliminado"); await load(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
        <div>
          <div className="text-[10px] font-black text-brand-500 uppercase tracking-[3px] leading-none mb-0.5">MÓDULO DE PERSONAL</div>
          <h2 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">Gestión de Empleados</h2>
        </div>
        <button onClick={openNew} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-400 transition-all active:scale-95 shrink-0">
          + Nuevo Empleado
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
      <div className="card-premium overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-surface-2 dark:bg-surface-dark-2 text-[9px] font-black text-content-muted dark:text-white/30 uppercase tracking-widest sticky top-0">
              <th className="px-4 py-2">Identificación</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Contacto</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-content-subtle text-xs font-bold uppercase tracking-widest italic opacity-40">
                  No se han registrado empleados en el sistema
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-content dark:text-heading-dark tracking-tight uppercase group-hover:text-brand-500 transition-colors">{e.full_name}</span>
                      <span className="text-[10px] font-black text-content-subtle mt-1 opacity-60">@{e.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${ROLE_BADGE[e.role_name] ? "bg-surface-2 dark:bg-white/5 border-border/20" : "bg-surface-1 dark:bg-white/5"}`}>
                      {e.role_label}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-content dark:text-content-dark">{e.email || "—"}</span>
                      {e.phone && <span className="text-[10px] text-content-subtle tabular-nums">{e.phone}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={[
                      "px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                      e.active
                        ? "text-success border-success/30 bg-success/5 shadow-[0_0_12px_rgba(34,197,94,0.1)]"
                        : "text-danger border-danger/30 bg-danger/5",
                    ].join(" ")}>
                      {e.active ? "En Servicio" : "Fuera de Línea"}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(e)}
                        className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500 hover:text-white transition-all active:scale-90 flex items-center justify-center"
                        title="Modificar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(e)}
                        className="w-10 h-10 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-90 flex items-center justify-center"
                        title="Eliminar acceso"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={closeModal} title={editId ? "EDITAR EMPLEADO" : "NUEVO EMPLEADO"} width={560}>
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          {[["Nombre completo *", "full_name", "text"], ["Usuario *", "username", "text"]].map(([label, key, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                type={type}
                className="input"
                autoFocus={key === "full_name"}
              />
            </div>
          ))}
        </div>
        <div className="mb-2.5">
          <label className="label">
            {editId ? "Contraseña (dejar vacío = no cambiar)" : "Contraseña *"}
          </label>
          <input
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            type="password"
            className="input"
          />
        </div>
        <div className="grid grid-cols-3 gap-2.5 mb-2.5">
          {[["Correo", "email", "email"], ["Teléfono", "phone", "text"]].map(([label, key, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                type={type}
                className="input"
              />
            </div>
          ))}
          <div>
            <label className="label">Rol *</label>
            <select
              value={form.role_id}
              onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))}
              className="input"
            >
              <option value="">Seleccionar rol</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {editId && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                className="rounded"
              />
              <span className="text-content-muted dark:text-content-dark-muted">Empleado activo</span>
            </label>
          </div>
        )}
        <div className="flex gap-2.5 justify-end mt-2">
          <button onClick={closeModal} className="btn-sm btn-secondary">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={loading}
            className={`btn-sm btn-primary ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {loading ? "Guardando..." : editId ? "Guardar" : "Crear empleado"}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar empleado?"
        message={`¿Estás seguro de que deseas eliminar a ${deleteConfirm?.full_name}? Esta acción no se puede deshacer.`}
        onConfirm={async () => {
          await del(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </div>
  );
}
