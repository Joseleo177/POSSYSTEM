import { useState } from "react";
import { api } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const EMPTY_SERIE = { name:"", prefix:"", padding:4 };
const EMPTY_RANGE = { start_number:"", end_number:"" };

export default function SeriesTab({ 
  notify, can, allSeries, loadAllSeries, allEmployees 
}) {
  const canConfig = can("config");
  const [serieForm, setSerieForm] = useState(EMPTY_SERIE);
  const [editSerie, setEditSerie] = useState(null);
  const [expandSerie, setExpandSerie] = useState(null); 
  const [rangeForm, setRangeForm] = useState(EMPTY_RANGE);
  const [savingSerie, setSavingSerie] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); 

  const saveSerie = async () => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    if (!serieForm.name || !serieForm.prefix) return notify("Nombre y prefijo son requeridos", "err");
    setSavingSerie(true);
    try {
      if (editSerie) {
        await api.series.update(editSerie.id, serieForm);
        notify("Serie actualizada"); setEditSerie(null);
      } else {
        await api.series.create(serieForm);
        notify("Serie creada");
      }
      setSerieForm(EMPTY_SERIE); loadAllSeries(); setShowModal(false);
    } catch (e) { notify(e.message, "err"); }
    setSavingSerie(false);
  };

  const deleteSerie = async (id) => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    try { await api.series.remove(id); notify("Serie eliminada"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const addRange = async (serieId) => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    if (!rangeForm.start_number || !rangeForm.end_number) return notify("Inicio y fin son requeridos", "err");
    try {
      await api.series.addRange(serieId, rangeForm);
      notify("Rango añadido"); setRangeForm(EMPTY_RANGE); loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
  };

  const deleteRange = async (rangeId) => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    try { await api.series.removeRange(rangeId); notify("Rango eliminado"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const toggleUserSerie = async (serie, userId) => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    const current = (serie.Employees || []).map(e => e.id);
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    try { await api.series.assignUsers(serie.id, { user_ids: updated }); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between gap-4 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center font-black text-xs">S</div>
          <div>
            <div className="text-[10px] font-black text-brand-500 uppercase tracking-wider leading-none mb-0.5">CONFIGURACIÓN FISCAL</div>
            <h2 className="text-xs font-black text-content dark:text-content-dark uppercase tracking-tight leading-none">Series y Correlativos</h2>
          </div>
        </div>
        {canConfig && (
          <button 
            onClick={() => { setEditSerie(null); setSerieForm(EMPTY_SERIE); setShowModal(true); }}
            className="btn-sm btn-primary h-8 px-4"
          >
            + Nueva Serie
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {allSeries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <div className="text-xs font-black uppercase tracking-wide">No hay series configuradas</div>
          </div>
        ) : (
          allSeries.map(serie => (
            <div key={serie.id} className="bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/5 rounded-lg overflow-hidden shadow-sm">
              <div className="px-4 py-3 flex items-center justify-between gap-4 bg-surface-1/50 dark:bg-white/[0.02] border-b border-border/20">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-brand-500 uppercase">{serie.prefix}</span>
                      <span className="font-black text-[12px] text-content dark:text-white uppercase tracking-tight">{serie.name}</span>
                    </div>
                    <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted opacity-60 uppercase tracking-widest mt-0.5">
                      {serie.padding} DÍGITOS · {(serie.SerieRanges||[]).filter(r=>r.active).length} RANGOS ACTIVOS
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpandSerie(expandSerie===serie.id ? null : serie.id)}
                    className="btn-sm bg-info/10 text-info hover:bg-info hover:text-white border-info/20 h-8 px-3 text-[10px]">
                    {expandSerie===serie.id ? "CERRAR" : "GESTIONAR"}
                  </button>
                  {canConfig && (
                    <>
                      <button onClick={() => { setEditSerie({...serie}); setSerieForm({...serie}); setShowModal(true); }}
                        className="btn-sm bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black border-brand-500/20 h-8 px-3 text-[10px]">
                        EDITAR
                      </button>
                      <button onClick={() => setDeleteConfirm({ type: 'serie', id: serie.id, name: serie.name })}
                        className="btn-sm bg-danger/10 text-danger hover:bg-danger hover:text-white border-danger/20 h-8 px-3">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandSerie === serie.id && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                  <div>
                    <h4 className="text-[10px] font-black tracking-wider uppercase text-content-subtle mb-3 opacity-60">Rangos de Correlativos</h4>
                    <div className="space-y-2">
                      {(serie.SerieRanges||[]).map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-surface-2 dark:bg-white/[0.03] rounded-lg border border-border/40">
                          <div className="flex flex-col">
                            <div className={`text-[11px] font-black ${r.active ? "text-success" : "text-content-subtle"}`}>
                              {serie.prefix}-{String(r.start_number).padStart(serie.padding,'0')} → {serie.prefix}-{String(r.end_number).padStart(serie.padding,'0')}
                            </div>
                            {r.active && <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-0.5">Actual: {serie.prefix}-{String(r.current_number).padStart(serie.padding,'0')}</div>}
                          </div>
                          {canConfig && (
                            <button onClick={() => setDeleteConfirm({ type: 'range', id: r.id, name: `${serie.prefix}-${String(r.start_number).padStart(serie.padding,'0')} / ${serie.prefix}-${String(r.end_number).padStart(serie.padding,'0')}` })}
                              className="w-6 h-6 rounded-md bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {canConfig && (
                        <div className="flex gap-2 pt-2">
                          <input type="number" placeholder="Inicio" value={rangeForm.start_number} onChange={e => setRangeForm(p=>({...p,start_number:e.target.value}))} className="input-pos bg-surface-2 dark:bg-black/20 h-8 px-3 text-[11px] font-black w-full" />
                          <input type="number" placeholder="Fin" value={rangeForm.end_number} onChange={e => setRangeForm(p=>({...p,end_number:e.target.value}))} className="input-pos bg-surface-2 dark:bg-black/20 h-8 px-3 text-[11px] font-black w-full" />
                          <button onClick={() => addRange(serie.id)} className="btn-sm btn-success h-8 px-4 text-[10px] font-black uppercase">+ Añadir</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black tracking-wider uppercase text-content-subtle mb-3 opacity-60">Usuarios con Acceso</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allEmployees.map(emp => {
                        const assigned = (serie.Employees||[]).some(e => e.id === emp.id);
                        return (
                          <div key={emp.id} onClick={() => canConfig && toggleUserSerie(serie, emp.id)}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${canConfig ? "cursor-pointer" : ""} ${assigned ? "bg-success/5 border-success/30" : "bg-surface-2 dark:bg-white/[0.03] border-border/40"}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${assigned ? "bg-success border-success" : "border-border/60"}`}>
                              {assigned && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className={`text-[11px] font-black uppercase truncate ${assigned ? "text-content dark:text-white" : "text-content-subtle"}`}>{emp.full_name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {/* Modales - SIEMPRE DENTRO DEL DIV DE CONTENIDO O DEL PRINCIPAL */}
        {(showModal || editSerie) && (
          <div onClick={() => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); }}
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300">
            <div onClick={e => e.stopPropagation()}
              className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-lg w-full max-w-[420px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="px-4 py-2.5 border-b border-border/40 dark:border-white/5 flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
                <div className="font-black text-[11px] tracking-wide text-brand-500 uppercase">{editSerie ? "Editar Serie" : "Registrar Nueva Serie"}</div>
                <button onClick={() => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); }}
                  className="text-content-muted hover:text-white transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Nombre de la Serie</div>
                  <input value={editSerie ? editSerie.name : serieForm.name} onChange={e => editSerie ? setEditSerie(p=>({...p,name:e.target.value})) : setSerieForm(p=>({...p,name:e.target.value}))}
                    placeholder="Ej: Facturación Principal" className="input-pos bg-white dark:bg-surface-dark border-none py-2.5 px-4 rounded-lg text-[11px] font-black uppercase w-full shadow-inner" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Prefijo</div>
                    <input value={editSerie ? editSerie.prefix : serieForm.prefix} onChange={e => editSerie ? setEditSerie(p=>({...p,prefix:e.target.value.toUpperCase()})) : setSerieForm(p=>({...p,prefix:e.target.value.toUpperCase()}))}
                      placeholder="Ej: A" className="input-pos bg-white dark:bg-surface-dark border-none py-2.5 px-4 rounded-lg text-[11px] font-black uppercase w-full shadow-inner" maxLength={10} />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1.5 ml-1">Dígitos</div>
                    <input type="number" min={1} max={8} value={editSerie ? editSerie.padding : serieForm.padding} onChange={e => editSerie ? setEditSerie(p=>({...p,padding:parseInt(e.target.value)||4})) : setSerieForm(p=>({...p,padding:parseInt(e.target.value)||4}))}
                      className="input-pos bg-white dark:bg-surface-dark border-none py-2.5 px-4 rounded-lg text-[11px] font-black uppercase w-full shadow-inner text-center" />
                  </div>
                </div>
                <button onClick={saveSerie} disabled={savingSerie} className="w-full h-10 rounded-lg bg-brand-500 text-brand-900 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-brand-500/20 active:scale-95 transition-all">
                  {savingSerie ? "PROCESANDO..." : editSerie ? "GUARDAR CAMBIOS" : "CREAR SERIE FISCAL"}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <ConfirmModal
            isOpen={!!deleteConfirm}
            title={deleteConfirm?.type === 'serie' ? "¿Eliminar serie fiscal?" : "¿Eliminar rango?"}
            message={deleteConfirm?.type === 'serie' ? `Estás a punto de eliminar la serie "${deleteConfirm?.name}".` : `¿Eliminar correlativo ${deleteConfirm?.name}?`}
            onConfirm={async () => {
              if (deleteConfirm.type === 'serie') await deleteSerie(deleteConfirm.id);
              else await deleteRange(deleteConfirm.id);
              setDeleteConfirm(null);
            }}
            onCancel={() => setDeleteConfirm(null)}
            type="danger"
            confirmText="Sí, eliminar"
          />
        )}
      </div>
    </div>
  );
}
