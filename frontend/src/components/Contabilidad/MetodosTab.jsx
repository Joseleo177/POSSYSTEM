import { useState } from "react";
import { api } from "../../services/api";
import { resolveImageUrl, toNameCase } from "../../helpers";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import MethodBankLogo from "../cobro/MethodBankLogo";
import StatusMark, { ACTIVE_STATUS } from "../ui/StatusMark";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon } from "../ui/Ledger";

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

  const canManage = can("journals.manage");
  const abrirNuevo  = () => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); setImage(EMPTY_IMAGE); setShowModal(true); };
  const abrirEditar = (m) => {
    setMethodEditId(m.id);
    setMethodForm({ name: m.name, code: m.code, color: m.color || "#555555", allows_outflow: m.allows_outflow ?? true });
    setImage({ file: null, current: m.image_url || null, clearImage: false });
  };
  // Qué puede hacer el método: es lo que decide dónde aparece (cobros, pagos a proveedores).
  const uso = (m) => m.allows_outflow === false ? "Solo recibe" : "Recibe y paga";

  // Acciones de la fila, siempre a la vista: en una tablet no hay hover que las descubra.
  const acciones = (m) => canManage ? (
    <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
      <RowIcon icon="edit" title="Editar método" onClick={() => abrirEditar(m)} />
      <RowIcon icon="power" title={m.active ? "Desactivar" : "Activar"} onClick={() => toggleMethod(m)} />
      <RowIcon icon="trash" tone="danger" title="Eliminar método" onClick={() => setDeleteConfirm(m)} />
    </div>
  ) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[13px] text-content-subtle">
          {paymentMethods.length} método{paymentMethods.length !== 1 ? "s" : ""}
        </span>
        {canManage && <Button onClick={abrirNuevo}>+ Nuevo método</Button>}
      </div>

      {/* ── Libro (escritorio) ── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="table-ledger min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="pl-4">Método</th>
              <th>Uso</th>
              <th>Estado</th>
              <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {paymentMethods.length === 0 ? (
              <LedgerEmpty cols={4} title="Sin métodos de pago" hint="Crea al menos uno para poder cobrar." />
            ) : paymentMethods.map(m => (
              <tr key={m.id} {...ledgerRow(canManage ? () => abrirEditar(m) : undefined)}>
                <td className="pl-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <MethodBankLogo src={m.image_url} size={32} />
                    <div className="min-w-0">
                      <div className={`text-[13px] font-semibold truncate ${m.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(m.name)}</div>
                      <div className="text-[12px] text-content-subtle truncate">{m.code}</div>
                    </div>
                  </div>
                </td>
                <td><span className="text-[13px] text-content-subtle">{uso(m)}</span></td>
                <td><StatusMark status={m.active ? "activo" : "inactivo"} map={ACTIVE_STATUS} /></td>
                <td className="pr-4 whitespace-nowrap cursor-default">{acciones(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (teléfono) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {paymentMethods.length === 0 ? (
          <div className="py-16 text-center px-6">
            <div className="text-[14px] font-semibold text-content dark:text-white">Sin métodos de pago</div>
            <div className="text-[13px] text-content-subtle mt-1">Crea al menos uno para poder cobrar.</div>
          </div>
        ) : paymentMethods.map(m => (
          <div key={m.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-1.5 py-3 flex items-center gap-3">
            <MethodBankLogo src={m.image_url} size={32} />
            <div className="min-w-0 flex-1">
              <div className={`text-[14px] font-semibold truncate ${m.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(m.name)}</div>
              <div className="flex items-center gap-2 text-[12px] text-content-subtle">
                <span className="truncate">{uso(m)}</span>
                {!m.active && <StatusMark status="inactivo" map={ACTIVE_STATUS} />}
              </div>
            </div>
            {acciones(m)}
          </div>
        ))}
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
              <p className="text-[11px] font-semibold text-content-subtle dark:text-white/30 leading-relaxed">
                Se ve en la botonera de "Pago Inmediato". PNG con fondo transparente queda mejor.
              </p>
              {imgPreview && (
                <button type="button"
                  onClick={() => setImage({ file: null, current: null, clearImage: true })}
                  className="text-[12px] font-medium text-content-subtle hover:text-danger transition-colors mt-1">
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
            <span className="text-[12px] text-content-subtle">
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
              <span className="block text-[12px] font-bold text-content dark:text-white tracking-tight">Tiene salidas</span>
              <span className="block text-[11px] font-semibold text-content-subtle mt-0.5">
                Permite usarlo para pagar egresos o compras. Desactívalo en métodos que solo reciben, como Punto de Venta.
              </span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
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
    </div>
  );
}
