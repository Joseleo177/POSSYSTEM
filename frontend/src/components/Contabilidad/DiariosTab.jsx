import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_JOURNAL = { name: "", type: "", color: "#6366f1", active: true, bank_id: null, currency_id: null };

export default function DiariosTab({
  notify, can, journals, loadJournals, activeMethods, methodByCode, activeBanks, currencies
}) {
  const [newJournal, setNewJournal] = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const addJournal = async () => {
    if (!newJournal.name.trim()) return notify("El nombre es requerido", "err");
    try {
      await api.journals.create(newJournal);
      notify("Diario creado"); loadJournals(); setShowModal(false); setNewJournal(EMPTY_JOURNAL);
    } catch (e) { notify(e.message, "err"); }
  };

  const saveJournal = async () => {
    if (!editJournal.name.trim()) return notify("El nombre es requerido", "err");
    try {
      await api.journals.update(editJournal.id, editJournal);
      notify("Diario actualizado"); loadJournals(); setEditJournal(null);
    } catch (e) { notify(e.message, "err"); }
  };

  const toggleJournal = async (j) => {
    try { await api.journals.toggle(j.id); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };

  const deleteJournal = async (id) => {
    try { await api.journals.remove(id); notify("Diario eliminado"); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-4 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center font-black text-xs">D</div>
          <div>
            <div className="text-[10px] font-black text-brand-500 uppercase tracking-wider leading-none mb-0.5">GESTIÓN CONTABLE</div>
            <h2 className="text-xs font-black text-content dark:text-content-dark uppercase tracking-tight leading-none">Diarios y Cajas</h2>
          </div>
        </div>
        {can("config") && (
          <button
            onClick={() => { setEditJournal(null); setNewJournal(EMPTY_JOURNAL); setShowModal(true); }}
            className="btn-sm btn-primary h-8 px-4"
          >
            + Nuevo Diario
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-auto">
        {journals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <div className="text-xs font-black uppercase tracking-wide">No hay diarios configurados</div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
              <tr className="border-b border-border/30 dark:border-white/5">
                <th className="w-12 px-4 py-2.5" />
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Nombre del Diario</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Método</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Banco / Entidad</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Moneda</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Estado</th>
                {can("config") && <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {journals.map((j) => {
                const isEdit = editJournal?.id === j.id;
                return (
                  <tr key={j.id} className="hover:bg-brand-500/5 transition-colors group">
                    <td className="px-4 py-2.5">
                      <div className="w-4 h-4 rounded-md shadow-sm" style={{ background: j.color }} />
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <input
                          value={editJournal.name}
                          onChange={e => setEditJournal(p => ({ ...p, name: e.target.value }))}
                          className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-2 px-4 rounded-lg text-[11px] font-black uppercase w-full"
                        />
                      ) : (
                        <span className="font-bold text-xs text-content dark:text-content-dark">{j.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <select
                          value={editJournal.type || ""}
                          onChange={e => setEditJournal(p => ({ ...p, type: e.target.value }))}
                          className="input-pos bg-white dark:bg-surface-dark border-border py-2 px-3 rounded-lg text-[11px] font-black uppercase"
                        >
                          <option value="">— Sin tipo</option>
                          {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                        </select>
                      ) : (
                        (() => {
                          const m = methodByCode[j.type];
                          return <span className="text-content-muted dark:text-content-dark-muted font-medium">{m ? `${m.icon || ""} ${m.name}`.trim() : (j.type || "—")}</span>;
                        })()
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <select
                          value={editJournal.bank_id || ""}
                          onChange={e => setEditJournal(p => ({ ...p, bank_id: e.target.value || "" }))}
                          className="input-pos bg-white dark:bg-surface-dark border-border py-2 px-4 rounded-lg text-[11px] font-black uppercase"
                        >
                          <option value="">— Sin banco</option>
                          {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-content-muted dark:text-content-dark-muted">{j.bank_name || j.bank || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {isEdit ? (
                        <select
                          value={editJournal.currency_id || ""}
                          onChange={e => setEditJournal(p => ({ ...p, currency_id: e.target.value || null }))}
                          className="input-pos bg-white dark:bg-surface-dark border-border py-2 px-4 rounded-lg text-[11px] font-black uppercase"
                        >
                          <option value="">— Base</option>
                          {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                        </select>
                      ) : (
                        j.currency_code ? (
                          <span className="px-2 py-0.5 bg-brand-500/5 text-brand-500 rounded-md border border-brand-500/10 font-black">
                            {j.currency_symbol} {j.currency_code}
                          </span>
                        ) : <span className="opacity-30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`badge ${j.active ? 'badge-success' : 'bg-danger/5 text-danger border-danger/20 badge'}`}>
                        {j.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveJournal} className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10 text-success hover:bg-success hover:text-white transition-all shadow-sm" title="Guardar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={() => setEditJournal(null)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-content hover:text-white transition-all shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditJournal({ ...j })} className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => toggleJournal(j)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/10 text-info hover:bg-info hover:text-white transition-all shadow-sm" title={j.active ? "Desactivar" : "Activar"}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirm(j)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
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
      {/* ↑ Cierra el div flex-1 de la tabla */}

      {/* Modal crear/editar — FUERA del div de tabla, DENTRO del div raíz */}
      {(showModal || editJournal) && (
        <div
          onClick={() => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); }}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-lg w-full max-w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-4 py-2.5 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-wide text-brand-500 uppercase">
                {editJournal ? "Editar Diario" : "Registrar Nueva Caja / Diario"}
              </div>
              <button onClick={() => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); }}
                className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Nombre del Diario</div>
                  <input
                    value={editJournal ? editJournal.name : newJournal.name}
                    onChange={e => editJournal ? setEditJournal(p => ({ ...p, name: e.target.value })) : setNewJournal(p => ({ ...p, name: e.target.value }))}
                    placeholder="ej. Caja Principal USD"
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Método de Pago</div>
                  <select
                    value={editJournal ? editJournal.type : newJournal.type}
                    onChange={e => editJournal ? setEditJournal(p => ({ ...p, type: e.target.value })) : setNewJournal(p => ({ ...p, type: e.target.value }))}
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full"
                  >
                    <option value="">— Ninguno</option>
                    {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Moneda</div>
                  <select
                    value={editJournal ? editJournal.currency_id || "" : newJournal.currency_id || ""}
                    onChange={e => editJournal ? setEditJournal(p => ({ ...p, currency_id: e.target.value || "" })) : setNewJournal(p => ({ ...p, currency_id: e.target.value || "" }))}
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full"
                  >
                    <option value="">— Base</option>
                    {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Banco Asociado</div>
                  <select
                    value={editJournal ? editJournal.bank_id || "" : newJournal.bank_id || ""}
                    onChange={e => editJournal ? setEditJournal(p => ({ ...p, bank_id: e.target.value || "" })) : setNewJournal(p => ({ ...p, bank_id: e.target.value || "" }))}
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2 px-3 rounded-lg text-[11px] font-black uppercase w-full"
                  >
                    <option value="">— Sin banco</option>
                    {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-2 ml-1">Color Identificador</div>
                  <input
                    type="color" value={editJournal ? editJournal.color : newJournal.color}
                    onChange={e => editJournal ? setEditJournal(p => ({ ...p, color: e.target.value })) : setNewJournal(p => ({ ...p, color: e.target.value }))}
                    className="w-full h-[46px] p-1 bg-white dark:bg-surface-dark border-none rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={editJournal ? saveJournal : addJournal}
                className="w-full h-9 rounded-lg bg-brand-500 text-black font-black text-[11px] uppercase tracking-wide shadow-lg hover:shadow-brand-500/20 transition-all border-none cursor-pointer"
              >
                {editJournal ? "GUARDAR CAMBIOS" : "CREAR DIARIO / CAJA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="¿Eliminar diario?"
          message={`Estás a punto de eliminar el diario "${deleteConfirm?.name}". Esta acción no se puede deshacer.`}
          onConfirm={async () => {
            await deleteJournal(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
          type="danger"
          confirmText="Sí, eliminar"
        />
      )}

    </div>
    // ↑ Cierra el div raíz h-full flex flex-col
  );
}