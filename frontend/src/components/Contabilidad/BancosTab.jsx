import { useState } from "react";
import { api } from "../../services/api";
import Page from "../ui/Page";
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
    <Page
      module="CONFIGURACIÓN DE ENTIDADES"
      title="Bancos e Instituciones Financieras"
      actions={can("config") && (
        <Button onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); setShowModal(true); }}>
          + Vincular Banco
        </Button>
      )}
    >
      {banks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">Sin bancos registrados</div>
        </div>
      ) : (
        <div className="card-premium overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 dark:bg-surface-dark-2">
                {["Nombre del Banco", "Código", "Cuentas / Diarios", "Estado", can("config") && "Acciones"].filter(Boolean).map(h => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : h === "Cuentas / Diarios" || h === "Estado" ? "text-center" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {banks.map((b) => {
                const isEdit = bankEditId === b.id;
                return (
                  <tr key={b.id} className="hover:bg-brand-500/[0.02] transition-colors group">
                    <td className="px-4 py-3">
                      {isEdit ? (
                        <input
                          autoFocus
                          value={bankForm.name}
                          onChange={e => setBankForm(p => ({ ...p, name: e.target.value }))}
                          className="input"
                          onKeyDown={e => e.key === "Enter" && saveBank()}
                        />
                      ) : (
                        <span className="font-bold text-xs text-content dark:text-content-dark uppercase tracking-wide">{b.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEdit ? (
                        <input
                          value={bankForm.code}
                          onChange={e => setBankForm(p => ({ ...p, code: e.target.value }))}
                          placeholder="0102"
                          className="input w-28"
                          onKeyDown={e => e.key === "Enter" && saveBank()}
                        />
                      ) : (
                        <span className="font-mono text-sm text-content-muted dark:text-content-dark-muted py-1 px-3 bg-surface-3 dark:bg-surface-dark rounded-md border border-border/40">
                          {b.code || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-content-muted font-black text-xs">{b.journals_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${b.active ? "text-success border-success/30 bg-success/5" : "text-danger border-danger/30 bg-danger/5"}`}>
                        {b.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveBank} disabled={bankSaving} className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10 text-success hover:bg-success hover:text-white transition-all" title="Guardar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={closeForm} className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-danger/10 hover:text-danger transition-all" title="Cancelar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setBankEditId(b.id); setBankForm({ name: b.name, code: b.code || "" }); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all"
                                title="Editar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button
                                onClick={() => toggleBank(b)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/10 text-info hover:bg-info hover:text-black transition-all"
                                title={b.active ? "Desactivar" : "Activar"}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(b)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all"
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
        </div>
      )}

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
    </Page>
  );
}
