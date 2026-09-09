import { useState } from "react";
import { api } from "../../services/api";
import { resolveImageUrl } from "../../helpers";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import MethodBankLogo from "../cobro/MethodBankLogo";

const EMPTY_METHOD = { name: "", code: "", color: "#555555", allows_outflow: true };
const EMPTY_IMAGE = { file: null, current: null, clearImage: false };

export default function MetodosTab({ notify, can, paymentMethods, loadPaymentMethods }) {
  const [methodForm, setMethodForm] = useState(EMPTY_METHOD);
  const [image, setImage] = useState(EMPTY_IMAGE);
  const [methodEditId, setMethodEditId] = useState(null);
  const [methodSaving, setMethodSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const imgPreview = image.file ? URL.createObjectURL(image.file) : (image.clearImage ? null : resolveImageUrl(image.current));

  const closeForm = () => {
    setShowModal(false);
    setMethodEditId(null);
    setMethodForm(EMPTY_METHOD);
    setImage(EMPTY_IMAGE);
  };

  const saveMethod = async () => {
    if (!methodForm.name.trim()) return notify("El nombre es requerido", "err");
    if (!methodEditId && !methodForm.code.trim()) return notify("El código es requerido", "err");
    setMethodSaving(true);
    try {
      if (methodEditId) {
        await api.paymentMethods.update(methodEditId, methodForm, image.file, image.clearImage);
        notify("Método actualizado");
      } else {
        await api.paymentMethods.create(methodForm, image.file);
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
        {can("journals.manage") && (
          <Button onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); setImage(EMPTY_IMAGE); setShowModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
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
        <table className="table-pos min-w-[680px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-12" />
                {["Nombre", "Código", "Estado", can("journals.manage") && "Acciones"].filter(Boolean).map(h => (
                  <th key={h} className={h === "Acciones" ? "text-right pr-6" : h === "Estado" ? "text-center" : "text-left"}>
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
                      <MethodBankLogo src={m.image_url} size={30} />
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
                      <div className="flex items-center gap-1.5">
                        <span className="badge badge-neutral shadow-none">
                          {m.code}
                        </span>
                        {m.allows_outflow === false && (
                          <span className="badge badge-neutral shadow-none opacity-60" title="No puede usarse para pagar egresos ni compras">
                            Solo entradas
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`badge shadow-none ${m.active ? "badge-success" : "badge-danger"}`}>
                        {m.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("journals.manage") && (
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
                                onClick={() => { setMethodEditId(m.id); setMethodForm({ name: m.name, code: m.code, color: m.color || "#555555", allows_outflow: m.allows_outflow ?? true }); setImage({ file: null, current: m.image_url || null, clearImage: false }); }}
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
          <div className="label mb-1">Logo (opcional)</div>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer group shrink-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-dashed border-border/40 dark:border-white/10 bg-surface-2 dark:bg-white/5 flex items-center justify-center group-hover:border-brand-500/50 transition-all">
                {imgPreview
                  ? <img src={imgPreview} alt="" className="w-full h-full object-contain p-1" />
                  : <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              </div>
              <input type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files[0] && setImage(p => ({ ...p, file: e.target.files[0], clearImage: false }))} />
            </label>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 leading-relaxed">
                Se ve en la botonera de "Pago Inmediato". PNG con fondo transparente queda mejor.
              </p>
              {imgPreview && (
                <button type="button"
                  onClick={() => setImage({ file: null, current: null, clearImage: true })}
                  className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-danger transition-colors mt-1">
                  Quitar logo
                </button>
              )}
            </div>
          </div>
        </div>
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
        <div className="mb-4">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={methodForm.allows_outflow ?? true}
              onChange={e => setMethodForm(p => ({ ...p, allows_outflow: e.target.checked }))}
              className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-brand-500"
            />
            <span>
              <span className="block text-[11px] font-black text-content dark:text-white uppercase tracking-tight">Tiene salidas</span>
              <span className="block text-[10px] font-bold text-content-subtle mt-0.5">
                Permite usarlo para pagar egresos o compras. Desactívalo en métodos que solo reciben, como Punto de Venta.
              </span>
            </span>
          </label>
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
