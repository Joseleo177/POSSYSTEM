import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

const EMPTY_BANK = { name: "", code: "" };

export default function BancosTab({ notify, can, banks, loadBanks }) {
  const [bankForm, setBankForm] = useState(EMPTY_BANK);
  const [bankEditId, setBankEditId] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeForm = () => {
    setShowModal(false);
    setBankEditId(null);
    setBankForm(EMPTY_BANK);
  };

  const saveBank = async () => {
    if (!bankForm.name.trim()) return notify("El nombre es requerido", "err");
    setBankSaving(true);
    try {
      if (bankEditId) {
        await api.banks.update(bankEditId, bankForm);
        notify("Banco actualizado");
      } else {
        await api.banks.create(bankForm);
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

  return (
    <>
      <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
          {banks.length} banco{banks.length !== 1 ? "s" : ""}
        </span>
        {can("config") && (
          <Button onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); setShowModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
            + Vincular Banco
          </Button>
        )}
      </div>

      <div className="card-premium overflow-auto flex-1">
      {banks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">Sin bancos registrados</div>
        </div>
      ) : (
        <table className="table-pos">
            <thead className="sticky top-0 z-10">
              <tr>
                {["Nombre del Banco", "Código", "Cuentas / Diarios", "Estado", can("config") && "Acciones"].filter(Boolean).map(h => (
                  <th key={h} className={h === "Acciones" ? "text-right pr-6" : h === "Cuentas / Diarios" || h === "Estado" ? "text-center" : "text-left"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => {
                const isEdit = bankEditId === b.id;
                return (
                  <tr key={b.id} className="group">
                    <td>
                      {isEdit ? (
                        <input
                          autoFocus
                          value={bankForm.name}
                          onChange={e => setBankForm(p => ({ ...p, name: e.target.value }))}
                          className="input"
                          onKeyDown={e => e.key === "Enter" && saveBank()}
                        />
                      ) : (
                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{b.name}</span>
                      )}
                    </td>
                    <td>
                      {isEdit ? (
                        <input
                          value={bankForm.code}
                          onChange={e => setBankForm(p => ({ ...p, code: e.target.value }))}
                          placeholder="0102"
                          className="input w-28"
                          onKeyDown={e => e.key === "Enter" && saveBank()}
                        />
                      ) : (
                        <span className="badge badge-neutral shadow-none">
                          {b.code || "—"}
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="text-brand-500 font-black text-[11px]">{b.journals_count ?? 0}</span>
                    </td>
                    <td className="text-center">
                      <span className={`badge shadow-none ${b.active ? "badge-success" : "badge-danger"}`}>
                        {b.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="text-right pr-6">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveBank} disabled={bankSaving} className="p-2 rounded-xl transition-all text-content-subtle hover:text-success hover:bg-success/10 active:scale-90" title="Guardar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={closeForm} className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90" title="Cancelar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setBankEditId(b.id); setBankForm({ name: b.name, code: b.code || "" }); }}
                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-warning hover:bg-warning/10 active:scale-90"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button
                                onClick={() => toggleBank(b)}
                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-info hover:bg-info/10 active:scale-90"
                                title={b.active ? "Desactivar" : "Activar"}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(b)}
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

      {/* Modal: Vincular banco */}
      <Modal open={showModal} onClose={closeForm} title="Vincular Banco" width={420}>
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
        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
          <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
          <Button variant="primary" onClick={saveBank} disabled={bankSaving}>
            {bankSaving ? "Guardando..." : "Registrar banco"}
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
    </>
  );
}
