import { useState } from "react";
import { api } from "../../services/api";

const EMPTY_BANK = { name:"", code:"", sort_order:0 };

export default function BancosTab({ 
  notify, can, banks, loadBanks 
}) {
  const [bankForm,   setBankForm]   = useState(EMPTY_BANK);
  const [bankEditId, setBankEditId] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [showModal,  setShowModal]  = useState(false);

  const saveBank = async () => {
    if (!bankForm.name.trim()) return notify("El nombre es requerido", "err");
    setBankSaving(true);
    try {
      if (bankEditId) {
        await api.banks.update(bankEditId, bankForm);
        notify("Banco actualizado ✓");
      } else {
        await api.banks.create(bankForm);
        notify("Banco creado ✓");
      }
      setBankForm(EMPTY_BANK); setBankEditId(null); setShowModal(false); loadBanks();
    } catch (e) { notify(e.message, "err"); }
    finally { setBankSaving(false); }
  };

  const toggleBank = async (b) => {
    try { await api.banks.toggle(b.id); loadBanks(); }
    catch (e) { notify(e.message, "err"); }
  };

  const removeBank = async (b) => {
    if (!confirm(`¿Eliminar "${b.name}"?`)) return;
    try { await api.banks.remove(b.id); notify("Banco eliminado"); loadBanks(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center text-xl">🏦</div>
            <div>
              <div className="text-[10px] font-black text-content-subtle uppercase tracking-[2px]">CONFIGURACIÓN DE ENTIDADES</div>
              <div className="text-sm font-black text-content dark:text-content-dark">Bancos e Instituciones Financieras</div>
            </div>
          </div>
          {can("config") && (
            <button 
              onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); setShowModal(true); }}
              className="px-6 py-2.5 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all border-none cursor-pointer"
            >
              + Vincular Banco
            </button>
          )}
        </div>

        {banks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-60">
            <div className="text-4xl mb-4">🏦</div>
            <div className="text-xs font-black uppercase tracking-widest text-content-muted">Sin bancos registrados</div>
          </div>
        ) : (
          <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl overflow-hidden border border-border/40 mb-8 shadow-sm">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-surface-3 dark:bg-surface-dark border-b border-border/40">
                  <th className="text-left px-6 py-4 font-black text-content-subtle uppercase tracking-widest">Nombre del Banco</th>
                  <th className="text-left px-6 py-4 font-black text-content-subtle uppercase tracking-widest">Código</th>
                  <th className="text-center px-6 py-4 font-black text-content-subtle uppercase tracking-widest">Cuentas/Diarios</th>
                  <th className="text-center px-6 py-4 font-black text-content-subtle uppercase tracking-widest">Estado</th>
                  {can("config") && <th className="text-right px-6 py-4 font-black text-content-subtle uppercase tracking-widest w-48">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {banks.map((b) => {
                  const isEdit = bankEditId === b.id;
                  return (
                    <tr key={b.id} className="hover:bg-brand-500/5 transition-colors group">
                      <td className="px-6 py-4">
                        {isEdit ? (
                          <input 
                            value={bankForm.name} 
                            onChange={e => setBankForm(p => ({...p, name: e.target.value}))}
                            className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-1.5 px-3 rounded-lg text-xs font-bold w-full" 
                          />
                        ) : (
                          <span className="font-bold text-content dark:text-content-dark">{b.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEdit ? (
                          <input 
                            value={bankForm.code} 
                            onChange={e => setBankForm(p => ({...p, code: e.target.value}))}
                            placeholder="0102" 
                            className="input-pos bg-white dark:bg-surface-dark border-border py-1.5 px-3 rounded-lg text-[10px] font-bold w-20" 
                          />
                        ) : (
                          <span className="font-mono text-content-muted dark:text-content-dark-muted py-0.5 px-2 bg-surface-3 dark:bg-surface-dark rounded border border-border/40">{b.code || "—"}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-content-muted font-black">{b.journals_count ?? 0}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${b.active ? 'bg-success/5 text-success border-success/20' : 'bg-danger/5 text-danger border-danger/20'}`}>
                          {b.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {can("config") && (
                        <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {isEdit ? (
                                <>
                                  <button onClick={saveBank} disabled={bankSaving} className="p-2.5 bg-success/10 text-success rounded-xl hover:bg-success hover:text-white transition-all shadow-sm">✓</button>
                                  <button onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); }} className="p-2.5 bg-surface-3 text-content-muted rounded-xl hover:bg-content hover:text-white transition-all shadow-sm">✕</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setBankEditId(b.id); setBankForm({ name:b.name, code:b.code||"", sort_order:b.sort_order??0 }); }} className="p-2.5 bg-brand-500/10 text-brand-500 rounded-xl hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">✎</button>
                                  <button onClick={() => toggleBank(b)} className="p-2.5 bg-info/10 text-info rounded-xl hover:bg-info hover:text-white transition-all shadow-sm" title={b.active ? "Desactivar" : "Activar"}>⏻</button>
                                  <button onClick={() => removeBank(b)} className="p-2.5 bg-danger/10 text-danger rounded-xl hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">🗑</button>
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


      {/* Modal Nuevo/Editar Banco */}
      {(showModal || bankEditId) && (
        <div 
          onClick={() => { setShowModal(false); setBankEditId(null); setBankForm(EMPTY_BANK); }}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-2xl w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-6 py-4 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-[2px] text-brand-500 uppercase">
                {bankEditId ? "Editar Banco" : "Vincular Nuevo Banco"}
              </div>
              <button onClick={() => { setShowModal(false); setBankEditId(null); setBankForm(EMPTY_BANK); }}
                className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">✕</button>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="col-span-2">
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Nombre de la Institución</div>
                  <input 
                    value={bankForm.name} 
                    onChange={e => setBankForm(p => ({...p, name: e.target.value}))} 
                    placeholder="ej. Banco de Venezuela" 
                    className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" 
                    onKeyDown={e => e.key === "Enter" && saveBank()}
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Código Bancario (0XXX)</div>
                  <input 
                    value={bankForm.code} 
                    onChange={e => setBankForm(p => ({...p, code: e.target.value}))} 
                    placeholder="ej. 0102" 
                    className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full font-mono" 
                    onKeyDown={e => e.key === "Enter" && saveBank()}
                  />
                </div>
              </div>

              <button 
                onClick={saveBank} 
                disabled={bankSaving}
                className="w-full py-4 rounded-xl bg-brand-500 text-black font-black text-[11px] uppercase tracking-[2px] shadow-lg hover:shadow-brand-500/20 transition-all border-none cursor-pointer"
              >
                {bankSaving ? "PROCESANDO..." : bankEditId ? "GUARDAR CAMBIOS" : "REGISTRAR BANCO"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
