import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_METHOD  = { name:"", code:"", color:"#555555", sort_order:0 };

export default function MetodosTab({ 
  notify, can, paymentMethods, loadPaymentMethods 
}) {
  const [methodForm,   setMethodForm]   = useState(EMPTY_METHOD);
  const [methodEditId, setMethodEditId] = useState(null);
  const [methodSaving, setMethodSaving] = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
      setMethodForm(EMPTY_METHOD); setMethodEditId(null); setShowModal(false); loadPaymentMethods();
    } catch (e) { notify(e.message, "err"); }
    finally { setMethodSaving(false); }
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl p-6 mb-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center font-bold">M</div>
            <div>
              <div className="text-[10px] font-black text-content-subtle uppercase tracking-[2px]">CONFIGURACIÓN DE COBRO</div>
              <div className="text-sm font-black text-content dark:text-content-dark">Métodos de Pago Autorizados</div>
            </div>
          </div>
          {can("config") && (
            <button 
              onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); setShowModal(true); }}
              className="px-6 py-2.5 rounded-xl bg-success text-white text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all border-none cursor-pointer"
            >
              + Nuevo Método
            </button>
          )}
        </div>

        {paymentMethods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-60">
            <div className="text-2xl mb-2 text-brand-500">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10m14 0v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14" /></svg>
      </div>
            <div className="text-xs font-black uppercase tracking-widest text-content-muted">Sin métodos configurados</div>
          </div>
        ) : (
          <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-2xl overflow-hidden border border-border/40 mb-8 shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-3 dark:bg-surface-dark border-b border-border/40">
                  <th className="w-20 px-6 py-4" />
                  <th className="text-left px-6 py-4 font-black text-content-subtle uppercase tracking-wider text-xs">Identificador</th>
                  <th className="text-left px-6 py-4 font-black text-content-subtle uppercase tracking-wider text-xs">Código Interno</th>
                  <th className="text-center px-6 py-4 font-black text-content-subtle uppercase tracking-wider text-xs">Uso Global</th>
                  <th className="text-center px-6 py-4 font-black text-content-subtle uppercase tracking-wider text-xs">Estado</th>
                  {can("config") && <th className="text-right px-6 py-4 font-black text-content-subtle uppercase tracking-wider text-xs w-48">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {paymentMethods.map((m) => {
                  const isEdit = methodEditId === m.id;
                  return (
                    <tr key={m.id} className="hover:bg-brand-500/5 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          {isEdit ? (
                            <input 
                              type="color" value={methodForm.color} 
                              onChange={e => setMethodForm(p => ({...p, color: e.target.value}))}
                              className="w-10 h-10 p-1 bg-white border-2 border-border/40 rounded-xl cursor-pointer" 
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full shadow-md" style={{ background: m.color || "#555" }} />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {isEdit ? (
                          <input 
                            value={methodForm.name} 
                            onChange={e => setMethodForm(p => ({...p, name: e.target.value}))}
                            className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-2 px-4 rounded-xl text-sm font-bold w-full" 
                          />
                        ) : (
                          <span className="font-bold text-base text-content dark:text-content-dark">{m.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-sm font-mono">
                         <span className="text-content-muted dark:text-content-dark-muted py-1 px-3 bg-surface-3 dark:bg-surface-dark rounded border border-border/40">{m.code}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-content-muted font-black text-base">{m.sales_count ?? 0}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${m.active ? 'bg-success/5 text-success border-success/20' : 'bg-danger/5 text-danger border-danger/20'}`}>
                          {m.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {can("config") && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEdit ? (
                              <>
                                <button onClick={saveMethod} disabled={methodSaving} className="p-2.5 bg-success/10 text-success rounded-xl hover:bg-success hover:text-white transition-all shadow-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); }} className="p-2.5 bg-surface-3 text-content-muted rounded-xl hover:bg-content hover:text-white transition-all shadow-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setMethodEditId(m.id); setMethodForm({ name:m.name, code:m.code, color:m.color||"#555555", sort_order:m.sort_order??0 }); }} className="p-2.5 bg-brand-500/10 text-brand-500 rounded-xl hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button onClick={() => toggleMethod(m)} className="p-2.5 bg-info/10 text-info rounded-xl hover:bg-info hover:text-white transition-all shadow-sm" title={m.active ? "Desactivar" : "Activar"}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                                </button>
                                <button onClick={() => setDeleteConfirm(m)} className="p-2.5 bg-danger/10 text-danger rounded-xl hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
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


      {/* Modal Nuevo/Editar Método de Pago */}
      {(showModal || methodEditId) && (
        <div 
          onClick={() => { setShowModal(false); setMethodEditId(null); setMethodForm(EMPTY_METHOD); }}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-success/30 rounded-2xl w-full max-w-[600px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-6 py-4 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-[2px] text-success uppercase">
                {methodEditId ? "Editar Método de Pago" : "Definir Nuevo Método"}
              </div>
               <button onClick={() => { setShowModal(false); setMethodEditId(null); setMethodForm(EMPTY_METHOD); }}
                className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="col-span-2">
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Nombre Público</div>
                  <input 
                    value={methodForm.name} 
                    onChange={e => setMethodForm(p => ({...p, name: e.target.value}))} 
                    placeholder="ej. Pago Móvil" 
                    className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" 
                  />
                </div>
                <div className={methodEditId ? "col-span-2 opacity-50 pointer-events-none" : ""}>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Código Interno (Inmutable)</div>
                  <input 
                    value={methodForm.code} 
                    onChange={e => setMethodForm(p => ({...p, code: e.target.value}))} 
                    placeholder="pago_movil" 
                    className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" 
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Color de Marca</div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="color" value={methodForm.color} 
                      onChange={e => setMethodForm(p => ({...p, color: e.target.value}))}
                      className="w-16 h-12 p-1 bg-white dark:bg-surface-dark border-2 border-border/40 rounded-xl cursor-pointer" 
                    />
                    <div className="text-[10px] font-bold text-content-subtle opacity-60 uppercase">Este color se usará en reportes y gráficos dinámicos</div>
                  </div>
                </div>
              </div>

              <button 
                onClick={saveMethod} 
                className="w-full py-4 rounded-xl bg-success text-white font-black text-[11px] uppercase tracking-[2px] shadow-lg hover:shadow-success/20 transition-all border-none cursor-pointer"
              >
                {methodSaving ? "PROCESANDO..." : methodEditId ? "GUARDAR CAMBIOS" : "REGISTRAR MÉTODO"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar método de pago?"
        message={`¿Estás seguro de que deseas eliminar el método "${deleteConfirm?.name}"?`}
        onConfirm={async () => {
          await removeMethod(deleteConfirm);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </div>
  );
}
