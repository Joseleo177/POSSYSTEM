import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

const EMPTY_FORM = { name: "", description: "", active: true, parent_warehouse_id: null };

/**
 * Gestiona el CRUD de almacenes y la asignación de empleados.
 *
 * @param {function} notify - Función de notificación de AppContext
 */
export function useWarehouses(notify) {
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editId, setEditId]         = useState(null);
  const [loading, setLoading]       = useState(false);

  // Lista completa de la empresa (solo id/nombre). El backend limita `warehouses` a los
  // almacenes asignados al empleado, pero el destino de una transferencia puede ser
  // cualquier almacén, así que ese selector necesita la lista sin filtrar.
  const [allWarehouses, setAllWarehouses] = useState([]);

  // ── Empleados (para asignación) ──────────────────────────────
  const [employees, setEmployees]           = useState([]);
  const [assignModal, setAssignModal]       = useState(null);
  const [assignSelected, setAssignSelected] = useState([]);

  const load = useCallback(async () => {
    try {
      const r = await api.warehouses.getAll();
      setWarehouses(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  const loadAllWarehouses = useCallback(async () => {
    try {
      const r = await api.warehouses.getAll({ scope: "all" });
      setAllWarehouses(r.data || []);
    } catch (e) {}
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const r = await api.employees.getAll();
      setEmployees(r.data);
    } catch (e) {}
  }, []);

  useEffect(() => { load(); loadAllWarehouses(); loadEmployees(); }, [load, loadAllWarehouses, loadEmployees]);

  // ── CRUD ─────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!form.name.trim()) { notify("El nombre es requerido", "err"); return; }
    setLoading(true);
    try {
      if (editId) {
        await api.warehouses.update(editId, form);
        notify("Almacén actualizado ✓");
      } else {
        await api.warehouses.create(form);
        notify("Almacén creado ✓");
      }
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  }, [form, editId, notify, load]);

  const remove = useCallback(async (id) => {
    try {
      await api.warehouses.remove(id);
      notify("Almacén eliminado");
      await load();
    } catch (e) { notify(e.message, "err"); }
  }, [notify, load]);

  const startEdit  = useCallback((w) => {
    setEditId(w.id);
    setForm({ name: w.name, description: w.description || "", active: w.active ?? true, sells: w.sells ?? true, parent_warehouse_id: w.parent_warehouse_id || null });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setForm(EMPTY_FORM);
  }, []);

  // ── Asignar empleados ─────────────────────────────────────────
  const openAssign = useCallback((w) => {
    setAssignModal(w);
    setAssignSelected((w.assigned_employees || []).map(e => e.employee_id));
  }, []);

  const toggleAssign = useCallback((empId) =>
    setAssignSelected(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    )
  , []);

  const saveAssign = useCallback(async () => {
    if (!assignModal) return;
    try {
      await api.warehouses.assignEmployees(assignModal.id, { employee_ids: assignSelected });
      notify("Empleados asignados ✓");
      setAssignModal(null);
      await load();
    } catch (e) { notify(e.message, "err"); }
  }, [assignModal, assignSelected, notify, load]);

  return {
    warehouses, load,
    allWarehouses,
    form, setForm,
    editId,
    loading,
    save, remove, startEdit, cancelEdit,
    // Empleados
    employees,
    assignModal, setAssignModal,
    assignSelected,
    openAssign, toggleAssign, saveAssign,
  };
}
