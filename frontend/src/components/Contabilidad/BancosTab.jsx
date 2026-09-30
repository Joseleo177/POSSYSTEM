import { useState } from "react";
import { api } from "../../services/api";
import { resolveImageUrl, toNameCase } from "../../helpers";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import MethodBankLogo from "../cobro/MethodBankLogo";
import StatusMark, { ACTIVE_STATUS } from "../ui/StatusMark";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon } from "../ui/Ledger";

const EMPTY_BANK = { name: "", code: "" };
const EMPTY_IMAGE = { file: null, current: null, clearImage: false };

export default function BancosTab({ notify, can, banks, loadBanks }) {
  const [bankForm, setBankForm] = useState(EMPTY_BANK);
  const [image, setImage] = useState(EMPTY_IMAGE);
  const [bankEditId, setBankEditId] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const imgPreview = image.file ? URL.createObjectURL(image.file) : (image.clearImage ? null : resolveImageUrl(image.current));

  const closeForm = () => {
    setShowModal(false);
    setBankEditId(null);
    setBankForm(EMPTY_BANK);
    setImage(EMPTY_IMAGE);
  };

  const saveBank = async () => {
    if (!bankForm.name.trim()) return notify("El nombre es requerido", "err");
    setBankSaving(true);
    try {
      if (bankEditId) {
        await api.banks.update(bankEditId, bankForm, image.file, image.clearImage);
        notify("Banco actualizado");
      } else {
        await api.banks.create(bankForm, image.file);
        notify("Banco creado");
      }
      closeForm();
      loadBanks();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setBankSaving(false);
    }
  };

  const toggleBank = async (b) => {
    try {
      await api.banks.toggle(b.id);
      loadBanks();
    } catch (e) {
      notify(e.message, "err");
    }
  };

  const removeBank = async (b) => {
    try {
      await api.banks.remove(b.id);
      notify("Banco eliminado");
      loadBanks();
    } catch (e) {
      notify(e.message, "err");
    }
  };

  const canManage = can("journals.manage");
  const abrirNuevo  = () => { setBankEditId(null); setBankForm(EMPTY_BANK); setImage(EMPTY_IMAGE); setShowModal(true); };
  const abrirEditar = (b) => {
    setBankEditId(b.id);
    setBankForm({ name: b.name, code: b.code || "" });
    setImage({ file: null, current: b.image_url || null, clearImage: false });
    setShowModal(true);
  };
  const cuentas = (b) => {
    const n = b.journals_count ?? 0;
    return n === 0 ? "Sin diarios" : `${n} ${n === 1 ? "diario" : "diarios"}`;
  };

  // Acciones siempre a la vista: en una tablet no hay hover que las descubra.
  const acciones = (b) => canManage ? (
    <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
      <RowIcon icon="edit" title="Editar banco" onClick={() => abrirEditar(b)} />
      <RowIcon icon="power" title={b.active ? "Desactivar" : "Activar"} onClick={() => toggleBank(b)} />
      <RowIcon icon="trash" tone="danger" title="Eliminar banco" onClick={() => setDeleteConfirm(b)} />
    </div>
  ) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[13px] text-content-subtle">
          {banks.length} banco{banks.length !== 1 ? "s" : ""}
        </span>
        {canManage && <Button onClick={abrirNuevo}>+ Vincular banco</Button>}
      </div>

      {/* ── Libro (escritorio) ── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="table-ledger min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="pl-4">Banco</th>
              <th>Diarios</th>
              <th>Estado</th>
              <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {banks.length === 0 ? (
              <LedgerEmpty cols={4} title="Sin bancos" hint="Vincula los bancos donde la empresa tiene cuentas." />
            ) : banks.map(b => (
              <tr key={b.id} {...ledgerRow(canManage ? () => abrirEditar(b) : undefined)}>
                <td className="pl-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <MethodBankLogo src={b.image_url} size={32} />
                    <div className="min-w-0">
                      <div className={`text-[13px] font-semibold truncate ${b.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(b.name)}</div>
                      <div className="text-[12px] text-content-subtle tabular-nums">{b.code ? `Código ${b.code}` : "Sin código"}</div>
                    </div>
                  </div>
                </td>
                <td><span className="text-[13px] text-content-subtle tabular-nums">{cuentas(b)}</span></td>
                <td><StatusMark status={b.active ? "activo" : "inactivo"} map={ACTIVE_STATUS} /></td>
                <td className="pr-4 whitespace-nowrap cursor-default">{acciones(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (teléfono) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {banks.length === 0 ? (
          <div className="py-16 text-center px-6">
            <div className="text-[14px] font-semibold text-content dark:text-white">Sin bancos</div>
            <div className="text-[13px] text-content-subtle mt-1">Vincula los bancos donde la empresa tiene cuentas.</div>
          </div>
        ) : banks.map(b => (
          <div key={b.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-1.5 py-3 flex items-center gap-3">
            <MethodBankLogo src={b.image_url} size={32} />
            <div className="min-w-0 flex-1">
              <div className={`text-[14px] font-semibold truncate ${b.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(b.name)}</div>
              <div className="flex items-center gap-2 text-[12px] text-content-subtle tabular-nums">
                <span className="truncate">{b.code ? `${b.code} · ` : ""}{cuentas(b)}</span>
                {!b.active && <StatusMark status="inactivo" map={ACTIVE_STATUS} />}
              </div>
            </div>
            {acciones(b)}
          </div>
        ))}
      </div>

      {/* Modal: Vincular / editar banco */}
      <Modal open={showModal} onClose={closeForm} title={bankEditId ? "Editar Banco" : "Vincular Banco"} width={420}>
        <div className="mb-3">
          <div className="label mb-1">Nombre de la institución *</div>
          <input
            autoFocus
            value={bankForm.name}
            onChange={e => setBankForm(p => ({ ...p, name: e.target.value }))}
            placeholder="ej. Banco de Venezuela"
            className="input"
            onKeyDown={e => e.key === "Enter" && saveBank()}
          />
        </div>
        <div className="mb-4">
          <div className="label mb-1">Código bancario (0XXX)</div>
          <input
            value={bankForm.code}
            onChange={e => setBankForm(p => ({ ...p, code: e.target.value }))}
            placeholder="ej. 0102"
            className="input"
            onKeyDown={e => e.key === "Enter" && saveBank()}
          />
        </div>
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
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
          <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
          <Button variant="primary" onClick={saveBank} disabled={bankSaving}>
            {bankSaving ? "Guardando..." : bankEditId ? "Guardar cambios" : "Registrar banco"}
          </Button>
        </div>
      </Modal>

      {/* Confirm: eliminar */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar banco?"
        message={`¿Estás seguro de que deseas eliminar "${deleteConfirm?.name}"?`}
        onConfirm={async () => { await removeBank(deleteConfirm); setDeleteConfirm(null); }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </div>
  );
}
