import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_METHOD = { name: "", code: "", color: "#555555", sort_order: 0 };

export default function MetodosTab({
  notify, can, paymentMethods, loadPaymentMethods
}) {
  const [methodForm, setMethodForm] = useState(EMPTY_METHOD);
  const [methodEditId, setMethodEditId] = useState(null);
  const [methodSaving, setMethodSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const saveMethod = async () => {
    if (!methodForm.name.trim()) return notify("El nombre es requerido", "err");
    if (!methodEditId && !methodForm.code.trim()) return notify("El codigo es requerido", "err");
    setMethodSaving(true);
    try {
      if (methodEditId) {
        await api.paymentMethods.update(methodEditId, methodForm);
        notify("Metodo actualizado");
      } else {
        await api.paymentMethods.create(methodForm);
        notify("Metodo creado");
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
    try { await api.paymentMethods.remove(m.id); notify("Metodo eliminado"); loadPaymentMethods(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">

      {/* Encabezado */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-4 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center font-black text-xs">M</div>
          <div>
            <div className="text-[10px] font-black text-brand-500 uppercase tracking-wider leading-none mb-0.5">CONFIGURACION</div>
            <h2 className="text-xs font-black text-content dark:text-white uppercase tracking-tight leading-none">Metodos de Pago</h2>
          </div>
        </div>
        {can("config") && (
          <button
            onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); setShowModal(true); }}
            className="btn-sm btn-primary h-8 px-4"
          >
            + Nuevo Metodo
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-auto">
        {paymentMethods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <div className="text-xs font-black uppercase tracking-wide">Sin metodos configurados</div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
              <tr className="border-b border-border/30 dark:border-white/5">
                <th className="w-16 px-4 py-2.5" />
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Identificador</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Codigo</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Uso Global</th>
                <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Estado</th>
                {can("config") && <th className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {paymentMethods.map((m) => {
                const isEdit = methodEditId === m.id;
                return (
                  <tr key={m.id} className="hover:bg-brand-500/5 transition-colors group">
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <input
                          type="color" value={methodForm.color}
                          onChange={e => setMethodForm(p => ({ ...p, color: e.target.value }))}
                          className="w-10 h-7 p-1 bg-white border border-border/40 rounded-lg cursor-pointer"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-md shadow-sm" style={{ background: m.color || "#555" }} />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit ? (
                        <input
                          value={methodForm.name}
                          onChange={e => setMethodForm(p => ({ ...p, name: e.target.value }))}
                          className="input-pos bg-white dark:bg-surface-dark border-brand-500/40 py-2 px-4 rounded-lg text-[11px] font-black uppercase w-full"
                        />
                      ) : (
                        <span className="font-bold text-xs text-content dark:text-content-dark">{m.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-mono font-bold text-content-muted dark:text-content-dark-muted py-1 px-3 bg-surface-3 dark:bg-surface-dark rounded border border-border/40">{m.code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-content-muted font-black text-xs">{m.sales_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`badge ${m.active ? 'badge-success' : 'bg-danger/5 text-danger border-danger/20 badge'}`}>
                        {m.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEdit ? (
                            <>
                              <button onClick={saveMethod} disabled={methodSaving} className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/10 text-success hover:bg-success hover:text-white transition-all shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); }} className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-content hover:text-white transition-all shadow-sm">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setMethodEditId(m.id); setMethodForm({ name: m.name, code: m.code, color: m.color || "#555555", sort_order: m.sort_order ?? 0 }); }} className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all shadow-sm" title="Editar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => toggleMethod(m)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/10 text-info hover:bg-info hover:text-white transition-all shadow-sm" title={m.active ? "Desactivar" : "Activar"}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirm(m)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
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

      {/* Modal crear/editar */}
      {(showModal || methodEditId) && (
        <div
          onClick={() => { setShowModal(false); setMethodEditId(null); setMethodForm(EMPTY_METHOD); }}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-lg w-full max-w-[420px] shadow-2xl overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-4 py-2.5 border-b border-border/40 dark:border-white/5 flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-wide text-brand-500 uppercase">
                {methodEditId ? "Editar Metodo" : "Definir Nuevo Metodo"}
              </div>
              <button
                onClick={() => { setShowModal(false); setMethodEditId(null); setMethodForm(EMPTY_METHOD); }}
                className="text-content-muted hover:text-white transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Nombre Publico</div>
                <input
                  value={methodForm.name}
                  onChange={e => setMethodForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="ej. Pago Movil"
                  className="input-pos bg-white dark:bg-surface-dark border-none py-2.5 px-4 rounded-lg text-[11px] font-black uppercase w-full shadow-inner"
                />
              </div>
              {!methodEditId && (
                <div>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Codigo Interno</div>
                  <input
                    value={methodForm.code}
                    onChange={e => setMethodForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="pago_movil"
                    className="input-pos bg-white dark:bg-surface-dark border-none py-2.5 px-4 rounded-lg text-[11px] font-black uppercase w-full shadow-inner"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Color de Marca</div>
                  <input
                    type="color"
                    value={methodForm.color}
                    onChange={e => setMethodForm(p => ({ ...p, color: e.target.value }))}
                    className="w-full h-10 p-1 bg-white dark:bg-surface-dark border-none rounded-lg cursor-pointer"
                  />
                </div>
                <div className="text-[9px] leading-tight font-bold text-content-subtle opacity-60 uppercase">
                  Este color identifica al metodo en reportes
                </div>
              </div>
              <button
                onClick={saveMethod}
                className="w-full h-10 rounded-lg bg-brand-500 text-brand-900 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-brand-500/20 active:scale-95 transition-all"
              >
                {methodSaving ? "PROCESANDO..." : methodEditId ? "GUARDAR CAMBIOS" : "REGISTRAR METODO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminacion */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Eliminar metodo de pago?"
          message={`Estas seguro de que deseas eliminar "${deleteConfirm?.name}"?`}
          onConfirm={async () => {
            await removeMethod(deleteConfirm);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
          type="danger"
          confirmText="Si, eliminar"
        />
      )}

    </div>
  );
}