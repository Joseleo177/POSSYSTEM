import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_BANK = { name: "", code: "", sort_order: 0 };

export default function BancosTab({
  notify, can, banks, loadBanks
}) {
  const [bankForm, setBankForm] = useState(EMPTY_BANK);
  const [bankEditId, setBankEditId] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Función centralizada para cerrar el formulario/modal
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
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* HEADER FIXO */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-4 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center font-black text-xs">B</div>
          <div>
            <div className="text-[10px] font-black text-brand-500 uppercase tracking-wider leading-none mb-0.5">CONFIGURACIÓN DE ENTIDADES</div>
            <h2 className="text-xs font-black text-content dark:text-content-dark uppercase tracking-tight leading-none">Bancos e Instituciones Financieras</h2>
          </div>
        </div>
        {can("config") && (
          <button
            onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); setShowModal(true); }}
            className="btn-sm btn-primary h-8 px-4"
          >
            + Vincular Banco
          </button>
        )}
      </div>

      {/* CUERPO CON SCROLL */}
      <div className="flex-1 min-h-0 overflow-auto">
        {banks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <div className="text-xs font-black uppercase tracking-wide">Sin bancos registrados</div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
              <tr className="border-b border-border/30 dark:border-white/5">
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Nombre del Banco</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Código</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Cuentas/Diarios</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Estado</th>
                {can("config") && <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {banks.map((b) => {
                const isEdit = bankEditId === b.id;
                return (
                  <tr key={b.id} className="hover:bg-brand-500/5 transition-colors group">
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <input
                          autoFocus
                          value={bankForm.name}
                          onChange={e => setBankForm(p => ({ ...p, name: e.target.value }))}
                          className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-2 px-4 rounded-lg text-[11px] font-black uppercase w-full"
                        />
                      ) : (
                        <span className="font-bold text-xs text-content dark:text-content-dark">{b.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <input
                          value={bankForm.code}
                          onChange={e => setBankForm(p => ({ ...p, code: e.target.value }))}
                          placeholder="0102"
                          className="input-pos bg-white dark:bg-surface-dark border-border py-2 px-4 rounded-lg text-[11px] font-black uppercase w-24"
                        />
                      ) : (
                        <span className="font-mono text-sm text-content-muted dark:text-content-dark-muted py-1 px-3 bg-surface-3 dark:bg-surface-dark rounded-md border border-border/40">{b.code || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-content-muted font-black text-xs">{b.journals_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`badge ${b.active ? 'badge-success' : 'bg-danger/5 text-danger border-danger/20 badge'}`}>
                        {b.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveBank} disabled={bankSaving} className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10 text-success hover:bg-success hover:text-white transition-all shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={closeForm} className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-content hover:text-white transition-all shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setBankEditId(b.id); setBankForm({ name: b.name, code: b.code || "", sort_order: b.sort_order ?? 0 }); }} className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => toggleBank(b)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/10 text-info hover:bg-info hover:text-white transition-all shadow-sm" title={b.active ? "Desactivar" : "Activar"}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirm(b)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
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

      {/* MODALES - FUERA DEL AREA DE SCROLL PERO DENTRO DEL DIV RAIZ */}
      {showModal && (
        <div
          onClick={closeForm}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-lg w-full max-w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-4 py-2.5 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-wide text-brand-500 uppercase">
                Vincular Nuevo Banco
              </div>
              <button onClick={closeForm}
                className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Nombre de la Institución</div>
                  <input
                    autoFocus
                    value={bankForm.name}
                    onChange={e => setBankForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="ej. Banco de Venezuela"
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full"
                    onKeyDown={e => e.key === "Enter" && saveBank()}
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Código Bancario (0XXX)</div>
                  <input
                    value={bankForm.code}
                    onChange={e => setBankForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="ej. 0102"
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full font-mono"
                    onKeyDown={e => e.key === "Enter" && saveBank()}
                  />
                </div>
              </div>

              <button
                onClick={saveBank}
                disabled={bankSaving}
                className="w-full h-9 rounded-lg bg-brand-500 text-black font-black text-[11px] uppercase tracking-wide shadow-lg hover:shadow-brand-500/20 transition-all border-none cursor-pointer"
              >
                {bankSaving ? "PROCESANDO..." : "REGISTRAR BANCO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="¿Eliminar banco?"
          message={`¿Estás seguro de que deseas eliminar la institución "${deleteConfirm?.name}"?`}
          onConfirm={async () => {
            await removeBank(deleteConfirm);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
          type="danger"
          confirmText="Sí, eliminar"
        />
      )}
    </div>
  );
}