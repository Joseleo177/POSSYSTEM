import { useState, useEffect } from "react";
import { api } from "../services/api";
import Modal from "./Modal";

const EMPTY = { username: "", password: "", full_name: "", email: "", phone: "", role_id: "" };

const btnSmall = {
  background: "transparent", border: "1px solid #333", color: "#888",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #333",
  color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};

const ROLE_COLORS = { admin: "#e74c3c", manager: "#f0a500", cashier: "#27ae60", warehouse: "#5dade2" };

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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew}
          style={{ background: "#f0a500", color: "#0f0f0f", border: "none", padding: "8px 20px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>
          + Nuevo empleado
        </button>
      </div>

      {/* Tabla */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #f0a500", color: "#f0a500" }}>
            {["Nombre", "Usuario", "Rol", "Correo", "Estado", "Acciones"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((e, i) => (
            <tr key={e.id} style={{ background: i % 2 === 0 ? "#111" : "transparent", borderBottom: "1px solid #1e1e1e" }}>
              <td style={{ padding: "10px 12px", fontWeight: "bold" }}>{e.full_name}</td>
              <td style={{ padding: "10px 12px", color: "#888" }}>{e.username}</td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{ background: ROLE_COLORS[e.role_name] + "22", color: ROLE_COLORS[e.role_name], border: `1px solid ${ROLE_COLORS[e.role_name]}44`, padding: "2px 8px", borderRadius: 3, fontSize: 11 }}>
                  {e.role_label}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "#666", fontSize: 11 }}>{e.email || "—"}</td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{ color: e.active ? "#27ae60" : "#e74c3c", fontSize: 11 }}>
                  {e.active ? "● Activo" : "○ Inactivo"}
                </span>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEdit(e)} style={{ ...btnSmall, color: "#f0a500", borderColor: "#f0a500" }}>Editar</button>
                  <button onClick={() => del(e.id)} style={{ ...btnSmall, color: "#e74c3c", borderColor: "#e74c3c" }}>Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal */}
      <Modal open={modal} onClose={closeModal} title={editId ? "✏ EDITAR EMPLEADO" : "+ NUEVO EMPLEADO"} width={560}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[["Nombre completo *", "full_name", "text"], ["Usuario *", "username", "text"]].map(([label, key, type]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
              <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} type={type} style={inp} autoFocus={key === "full_name"} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {editId ? "Contraseña (dejar vacío = no cambiar)" : "Contraseña *"}
          </div>
          <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} type="password" style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[["Correo", "email", "email"], ["Teléfono", "phone", "text"]].map(([label, key, type]) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
              <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} type={type} style={inp} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Rol *</div>
            <select value={form.role_id} onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))} style={{ ...inp, padding: "8px 10px" }}>
              <option value="">Seleccionar rol</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {editId && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
              <span style={{ color: "#888" }}>Empleado activo</span>
            </label>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={closeModal} style={{ ...btnSmall, padding: "8px 18px", fontSize: 12 }}>Cancelar</button>
          <button onClick={save} disabled={loading}
            style={{ background: loading ? "#7a5200" : "#f0a500", color: "#0f0f0f", border: "none", padding: "8px 24px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer", fontSize: 13 }}>
            {loading ? "Guardando..." : editId ? "Guardar" : "Crear empleado"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
