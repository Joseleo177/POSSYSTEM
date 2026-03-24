import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_JOURNAL = { name: "", type: "", bank_id: "", color: "#555555", currency_id: "" };

export default function DiariosTab({
  notify, can, journals, loadJournals, currencies, activeMethods, activeBanks, methodByCode
}) {
  const [newJournal, setNewJournal] = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const addJournal = async () => {
    if (!newJournal.name) return notify("El nombre es requerido", "err");
    try { await api.journals.create(newJournal); notify("Diario creado"); setNewJournal(EMPTY_JOURNAL); setShowModal(false); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const saveJournal = async () => {
    if (!editJournal.name) return notify("El nombre es requerido", "err");
    try { await api.journals.update(editJournal.id, editJournal); notify("Diario actualizado"); setEditJournal(null); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const toggleJournal = async (j) => {
    try { await api.journals.update(j.id, { ...j, active: !j.active }); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const deleteJournal = async (id) => {
    try { await api.journals.remove(id); notify("Diario eliminado"); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center text-xl"></div>
            <div>
              <div className="text-[10px] font-black text-content-subtle uppercase tracking-[2px]">GESTIÓN CONTABLE</div>
              <div className="text-sm font-black text-content dark:text-content-dark">Diarios y Cajas de Cobro</div>
            </div>
          </div>
          {can("config") && (
            <button
              onClick={() => { setEditJournal(null); setNewJournal(EMPTY_JOURNAL); setShowModal(true); }}
              className="px-6 py-2.5 rounded-xl bg-info text-white text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all border-none cursor-pointer"
            >
              + Nuevo Diario
            </button>
          )}
        </div>

        {journals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-60">
            <div className="text-4xl mb-4"></div>
            <div className="text-xs font-black uppercase tracking-widest text-content-muted">No hay diarios configurados</div>
          </div>
        ) : (
          <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl overflow-hidden border border-border/40 mb-8 shadow-sm">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-surface-3 dark:bg-surface-dark border-b border-border/40">
                  <th className="w-12 px-4 py-4" />
                  <th className="text-left px-4 py-4 font-black text-content-subtle uppercase tracking-widest">Nombre del Diario</th>
                  <th className="text-left px-4 py-4 font-black text-content-subtle uppercase tracking-widest">Método</th>
                  <th className="text-left px-4 py-4 font-black text-content-subtle uppercase tracking-widest">Banco / Entidad</th>
                  <th className="text-center px-4 py-4 font-black text-content-subtle uppercase tracking-widest">Moneda</th>
                  <th className="text-center px-4 py-4 font-black text-content-subtle uppercase tracking-widest">Estado</th>
                  {can("config") && <th className="text-right px-4 py-4 font-black text-content-subtle uppercase tracking-widest w-48">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {journals.map((j) => {
                  const isEdit = editJournal?.id === j.id;
                  return (
                    <tr key={j.id} className="hover:bg-brand-500/5 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: j.color }} />
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <input
                            value={editJournal.name}
                            onChange={e => setEditJournal(p => ({ ...p, name: e.target.value }))}
                            className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-1.5 px-3 rounded-lg text-xs font-bold w-full"
                          />
                        ) : (
                          <span className="font-bold text-content dark:text-content-dark">{j.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <select
                            value={editJournal.type || ""}
                            onChange={e => setEditJournal(p => ({ ...p, type: e.target.value }))}
                            className="input-pos bg-white dark:bg-surface-dark border-border py-1.5 px-3 rounded-lg text-[10px] font-bold"
                          >
                            <option value="">— Sin tipo</option>
                            {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                          </select>
                        ) : (
                          (() => {
                            const m = methodByCode[j.type];
                            return <span className="text-content-muted dark:text-content-dark-muted font-medium">{m ? `${m.icon} ${m.name}` : (j.type || "—")}</span>;
                          })()
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <select
                            value={editJournal.bank_id || ""}
                            onChange={e => setEditJournal(p => ({ ...p, bank_id: e.target.value || "" }))}
                            className="input-pos bg-white dark:bg-surface-dark border-border py-1.5 px-3 rounded-lg text-[10px] font-bold"
                          >
                            <option value="">— Sin banco</option>
                            {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-content-muted dark:text-content-dark-muted">{j.bank_name || j.bank || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEdit ? (
                          <select
                            value={editJournal.currency_id || ""}
                            onChange={e => setEditJournal(p => ({ ...p, currency_id: e.target.value || null }))}
                            className="input-pos bg-white dark:bg-surface-dark border-border py-1.5 px-3 rounded-lg text-[10px] font-bold"
                          >
                            <option value="">— Base</option>
                            {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                          </select>
                        ) : (
                          j.currency_code ? (
                            <span className="px-2 py-0.5 bg-brand-500/5 text-brand-500 rounded-lg border border-brand-500/10 font-black">
                              {j.currency_symbol} {j.currency_code}
                            </span>
                          ) : <span className="opacity-30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${j.active ? 'bg-success/5 text-success border-success/20' : 'bg-danger/5 text-danger border-danger/20'}`}>
                          {j.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {can("config") && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEdit ? (
                              <>
                                <button onClick={saveJournal} className="p-2.5 bg-success/10 text-success rounded-xl hover:bg-success hover:text-white transition-all shadow-sm" title="Guardar">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button onClick={() => setEditJournal(null)} className="p-2.5 bg-surface-3 text-content-muted rounded-xl hover:bg-content hover:text-white transition-all shadow-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditJournal({ ...j })} className="p-2.5 bg-brand-500/10 text-brand-500 rounded-xl hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button onClick={() => toggleJournal(j)} className="p-2.5 bg-info/10 text-info rounded-xl hover:bg-info hover:text-white transition-all shadow-sm" title={j.active ? "Desactivar" : "Activar"}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                                </button>
                                <button onClick={() => setDeleteConfirm(j)} className="p-2.5 bg-danger/10 text-danger rounded-xl hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
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


        {/* Modal Nueva/Editar Caja o Diario */}
        {(showModal || editJournal) && (
          <div
            onClick={() => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); }}
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="bg-surface-2 dark:bg-surface-dark-2 border border-info/30 rounded-2xl w-full max-w-[600px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
            >
              <div className="px-6 py-4 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
                <div className="font-black text-[11px] tracking-[2px] text-info uppercase">
                  {editJournal ? "Editar Diario" : "Registrar Nueva Caja / Diario"}
                </div>
                 <button onClick={() => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); }}
                  className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="col-span-2">
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Nombre del Diario</div>
                    <input
                      value={editJournal ? editJournal.name : newJournal.name}
                      onChange={e => editJournal ? setEditJournal(p => ({ ...p, name: e.target.value })) : setNewJournal(p => ({ ...p, name: e.target.value }))}
                      placeholder="ej. Caja Principal USD"
                      className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Método de Pago</div>
                    <select
                      value={editJournal ? editJournal.type : newJournal.type}
                      onChange={e => editJournal ? setEditJournal(p => ({ ...p, type: e.target.value })) : setNewJournal(p => ({ ...p, type: e.target.value }))}
                      className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full"
                    >
                      <option value="">— Ninguno</option>
                      {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Moneda</div>
                    <select
                      value={editJournal ? editJournal.currency_id || "" : newJournal.currency_id || ""}
                      onChange={e => editJournal ? setEditJournal(p => ({ ...p, currency_id: e.target.value || "" })) : setNewJournal(p => ({ ...p, currency_id: e.target.value || "" }))}
                      className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full"
                    >
                      <option value="">— Base</option>
                      {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Banco Asociado</div>
                    <select
                      value={editJournal ? editJournal.bank_id || "" : newJournal.bank_id || ""}
                      onChange={e => editJournal ? setEditJournal(p => ({ ...p, bank_id: e.target.value || "" })) : setNewJournal(p => ({ ...p, bank_id: e.target.value || "" }))}
                      className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full"
                    >
                      <option value="">— Sin banco</option>
                      {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Color Identificador</div>
                    <input
                      type="color" value={editJournal ? editJournal.color : newJournal.color}
                      onChange={e => editJournal ? setEditJournal(p => ({ ...p, color: e.target.value })) : setNewJournal(p => ({ ...p, color: e.target.value }))}
                      className="w-full h-[46px] p-1 bg-white dark:bg-surface-dark border-none rounded-xl cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  onClick={editJournal ? saveJournal : addJournal}
                  className="w-full py-4 rounded-xl bg-info text-white font-black text-[11px] uppercase tracking-[2px] shadow-lg hover:shadow-info/20 transition-all border-none cursor-pointer"
                >
                  {editJournal ? "GUARDAR CAMBIOS" : "CREAR DIARIO / CAJA"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}
