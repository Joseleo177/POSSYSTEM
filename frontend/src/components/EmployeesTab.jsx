import { useState, useEffect } from "react";
import { api } from "../services/api";
import Modal from "./Modal";

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
      if (editId) { await api.employees.update(editId, form); notify("Empleado actualizado ✓"); }
      else        { await api.employees.create(form); notify("Empleado creado ✓"); }
      closeModal(); await load();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  };

  const del = async (id) => {
    if (!confirm("¿Eliminar empleado?")) return;
    try { await api.employees.remove(id); notify("Empleado eliminado"); await load(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div>
      {/* Cabecera */}
      <div className="flex justify-end mb-4">
        <button onClick={openNew} className="btn-sm btn-primary">
          + Nuevo empleado
        </button>
      </div>

      {/* Tabla */}
      <table className="table-pos">
        <thead>
          <tr>
            {["Nombre", "Usuario", "Rol", "Correo", "Estado", "Acciones"].map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="font-semibold">{e.full_name}</td>
              <td className="text-content-muted dark:text-content-dark-muted">{e.username}</td>
              <td>
                <span className={ROLE_BADGE[e.role_name] ?? "badge-neutral"}>
                  {e.role_label}
                </span>
              </td>
              <td className="text-content-muted dark:text-content-dark-muted text-xs">{e.email || "—"}</td>
              <td>
                <span className={`text-xs font-medium ${e.active ? "text-success" : "text-danger"}`}>
                  {e.active ? "● Activo" : "○ Inactivo"}
                </span>
              </td>
              <td>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => openEdit(e)}
                    className="btn-sm border border-warning/60 text-warning bg-transparent hover:bg-warning/10 dark:hover:bg-warning/10"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => del(e.id)}
                    className="btn-sm border border-danger/60 text-danger bg-transparent hover:bg-danger/10 dark:hover:bg-danger/10"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal */}
      <Modal open={modal} onClose={closeModal} title={editId ? "✏ EDITAR EMPLEADO" : "+ NUEVO EMPLEADO"} width={560}>
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
    </div>
  );
}
