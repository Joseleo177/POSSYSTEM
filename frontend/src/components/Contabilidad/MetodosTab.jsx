import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

const EMPTY_METHOD = { name: "", code: "", color: "#555555" };

export default function MetodosTab({ notify, can, paymentMethods, loadPaymentMethods }) {
  const [methodForm, setMethodForm] = useState(EMPTY_METHOD);
  const [methodEditId, setMethodEditId] = useState(null);
  const [methodSaving, setMethodSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeForm = () => {
    setShowModal(false);
    setMethodEditId(null);
    setMethodForm(EMPTY_METHOD);
  };

  const saveMethod = async () => {
    if (!methodForm.name.trim()) return notify("El nombre es requerido", "err");
    if (!methodEditId && !methodForm.code.trim()) return notify("El código es requerido", "err");
    setMethodSaving(true);
    try {
      if (methodEditId) {
        await api.paymentMethods.update(methodEditId, methodForm);
        notify("Método actualizado");
      } else {
        await api.paymentMethods.create(methodForm);
        notify("Método creado");
      }
      closeForm();
      loadPaymentMethods();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setMethodSaving(false);
    }
  };

  const toggleMethod = async (m) => {
    try { await api.paymentMethods.toggle(m.id); loadPaymentMethods(); }
    catch (e) { notify(e.message, "err"); }
  };

  const removeMethod = async (m) => {
    try { await api.paymentMethods.remove(m.id); notify("Método eliminado"); loadPaymentMethods(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <>
      <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
          {paymentMethods.length} método{paymentMethods.length !== 1 ? "s" : ""}
        </span>
        {can("config") && (
          <Button onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); setShowModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
            + Nuevo Método
          </Button>
        )}
      </div>

      <div className="card-premium overflow-auto flex-1">
      {paymentMethods.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">Sin métodos configurados</div>
        </div>
      ) : (
        <table className="table-pos">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-12" />
                {["Nombre", "Código", "Uso Global", "Estado", can("config") && "Acciones"].filter(Boolean).map(h => (
                  <th key={h} className={h === "Acciones" ? "text-right pr-6" : h === "Uso Global" || h === "Estado" ? "text-center" : "text-left"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((m) => {
                const isEdit = methodEditId === m.id;
                return (
                  <tr key={m.id} className="group">
                    <td>
                      {isEdit ? (
                        <input
                          type="color"
                          value={methodForm.color}
                          onChange={e => setMethodForm(p => ({ ...p, color: e.target.value }))}
                          className="w-10 h-7 p-1 bg-white border border-border/40 rounded-lg cursor-pointer"
                        />
                      ) : (
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ background: m.color || "#555" }} />
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <input
                          autoFocus
                          value={methodForm.name}
                          onChange={e => setMethodForm(p => ({ ...p, name: e.target.value }))}
                          className="input"
                        />
                      ) : (
                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{m.name}</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral shadow-none">
                        {m.code}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="text-brand-500 font-black text-[11px]">{m.sales_count ?? 0}</span>
                    </td>
                    <td className="text-center">
                      <span className={`badge shadow-none ${m.active ? "badge-success" : "badge-danger"}`}>
                        {m.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="text-right pr-6">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveMethod} disabled={methodSaving} className="p-2 rounded-xl transition-all text-content-subtle hover:text-success hover:bg-success/10 active:scale-90" title="Guardar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={closeForm} className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90" title="Cancelar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setMethodEditId(m.id); setMethodForm({ name: m.name, code: m.code, color: m.color || "#555555" }); }}
                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-warning hover:bg-warning/10 active:scale-90"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button
                                onClick={() => toggleMethod(m)}
                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-info hover:bg-info/10 active:scale-90"
                                title={m.active ? "Desactivar" : "Activar"}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(m)}
                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90"
                                title="Eliminar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
      )}
      </div>

      {/* Modal: crear / editar */}
      <Modal
        open={showModal || !!methodEditId}
        onClose={closeForm}
        title={methodEditId ? "Editar Método" : "Nuevo Método de Pago"}
        width={420}
      >
        <div className="mb-3">
          <div className="label mb-1">Nombre público *</div>
          <input
            autoFocus
            value={methodForm.name}
            onChange={e => setMethodForm(p => ({ ...p, name: e.target.value }))}
            placeholder="ej. Pago Móvil"
            className="input"
          />
        </div>
        {!methodEditId && (
          <div className="mb-3">
            <div className="label mb-1">Código interno *</div>
            <input
              value={methodForm.code}
              onChange={e => setMethodForm(p => ({ ...p, code: e.target.value }))}
              placeholder="ej. pago_movil"
              className="input"
            />
          </div>
        )}
        <div className="mb-4">
          <div className="label mb-1">Color de marca</div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={methodForm.color}
              onChange={e => setMethodForm(p => ({ ...p, color: e.target.value }))}
              className="w-12 h-9 p-1 bg-white border border-border/40 rounded-lg cursor-pointer"
            />
            <span className="text-[11px] text-content-subtle uppercase tracking-wide">
              Identifica al método en reportes
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
          <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
          <Button variant="primary" onClick={saveMethod} disabled={methodSaving}>
            {methodSaving ? "Guardando..." : methodEditId ? "Guardar cambios" : "Registrar método"}
          </Button>
        </div>
      </Modal>

      {/* Confirm: eliminar */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar método de pago?"
        message={`¿Estás seguro de que deseas eliminar "${deleteConfirm?.name}"?`}
        onConfirm={async () => { await removeMethod(deleteConfirm); setDeleteConfirm(null); }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </>
  );
}
