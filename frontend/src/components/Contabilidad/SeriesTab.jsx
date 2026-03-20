import { useState } from "react";
import { api } from "../../services/api";

const EMPTY_SERIE = { name:"", prefix:"", padding:4 };
const EMPTY_RANGE = { start_number:"", end_number:"" };

export default function SeriesTab({ 
  notify, allSeries, loadAllSeries, allEmployees 
}) {
  const [serieForm,     setSerieForm]     = useState(EMPTY_SERIE);
  const [editSerie,     setEditSerie]     = useState(null);
  const [expandSerie,   setExpandSerie]   = useState(null); // id de serie expandida
  const [rangeForm,     setRangeForm]     = useState(EMPTY_RANGE);
  const [savingSerie,   setSavingSerie]   = useState(false);
  const [showModal,     setShowModal]     = useState(false);

  const saveSerie = async () => {
    if (!serieForm.name || !serieForm.prefix) return notify("Nombre y prefijo son requeridos", "err");
    setSavingSerie(true);
    try {
      if (editSerie) {
        await api.series.update(editSerie.id, serieForm);
        notify("Serie actualizada ✓"); setEditSerie(null);
      } else {
        await api.series.create(serieForm);
        notify("Serie creada ✓");
      }
      setSerieForm(EMPTY_SERIE); loadAllSeries(); setShowModal(false);
    } catch (e) { notify(e.message, "err"); }
    setSavingSerie(false);
  };

  const deleteSerie = async (id) => {
    if (!confirm("¿Eliminar esta serie y todos sus rangos?")) return;
    try { await api.series.remove(id); notify("Serie eliminada"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const addRange = async (serieId) => {
    if (!rangeForm.start_number || !rangeForm.end_number) return notify("Inicio y fin son requeridos", "err");
    try {
      await api.series.addRange(serieId, rangeForm);
      notify("Rango añadido ✓"); setRangeForm(EMPTY_RANGE); loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
  };

  const deleteRange = async (rangeId) => {
    if (!confirm("¿Eliminar este rango?")) return;
    try { await api.series.removeRange(rangeId); notify("Rango eliminado"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const toggleUserSerie = async (serie, userId) => {
    const current = (serie.Employees || []).map(e => e.id);
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    try { await api.series.assignUsers(serie.id, { user_ids: updated }); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-[10px] font-black text-content-subtle uppercase tracking-[2px]">CONFIGURACIÓN FISCAL</div>
          <div className="text-sm font-black text-content dark:text-content-dark">Series y Correlativos</div>
        </div>
        <button 
          onClick={() => { setEditSerie(null); setSerieForm(EMPTY_SERIE); setShowModal(true); }}
          className="px-6 py-2.5 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all border-none cursor-pointer"
        >
          + Nueva Serie
        </button>
      </div>

      {/* Modal Nueva/Editar Serie */}
      {(showModal || editSerie) && (
        <div 
          onClick={() => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); }}
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5 animate-in fade-in duration-300"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 dark:bg-surface-dark-2 border border-brand-500/30 rounded-2xl w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="px-6 py-4 border-b border-border dark:border-border-dark flex justify-between items-center bg-surface-3 dark:bg-surface-dark-3">
              <div className="font-black text-[11px] tracking-[2px] text-brand-500 uppercase">
                {editSerie ? "Editar Serie" : "Registrar Nueva Serie"}
              </div>
              <button onClick={() => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); }}
                className="bg-transparent border-none text-content-muted text-xl cursor-pointer hover:text-content transition-all">✕</button>
            </div>
            
            <div className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="col-span-2">
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Nombre de la Serie</div>
                  <input value={editSerie ? editSerie.name : serieForm.name}
                    onChange={e => editSerie ? setEditSerie(p=>({...p,name:e.target.value})) : setSerieForm(p=>({...p,name:e.target.value}))}
                    placeholder="Ej: Facturación Principal" className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" />
                </div>
                <div>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Prefijo</div>
                  <input value={editSerie ? editSerie.prefix : serieForm.prefix}
                    onChange={e => editSerie ? setEditSerie(p=>({...p,prefix:e.target.value.toUpperCase()})) : setSerieForm(p=>({...p,prefix:e.target.value.toUpperCase()}))}
                    placeholder="Ej: A" className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" maxLength={10} />
                </div>
                <div>
                  <div className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1">Dígitos Correlativo</div>
                  <input type="number" min={1} max={8}
                    value={editSerie ? editSerie.padding : serieForm.padding}
                    onChange={e => editSerie ? setEditSerie(p=>({...p,padding:parseInt(e.target.value)||4})) : setSerieForm(p=>({...p,padding:parseInt(e.target.value)||4}))}
                    className="input-pos bg-white dark:bg-surface-dark border-none py-3 px-4 rounded-xl text-sm font-bold w-full" />
                </div>
              </div>

              {(editSerie ? editSerie.prefix && editSerie.padding : serieForm.prefix && serieForm.padding) && (
                <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 mb-8 text-center">
                  <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1">Vista Previa de Factura</div>
                  <div className="text-xl font-black text-brand-500 tracking-tight">
                    {(editSerie||serieForm).prefix}-{String(1).padStart((editSerie||serieForm).padding,'0')}
                  </div>
                </div>
              )}

              <button onClick={saveSerie} disabled={savingSerie}
                className="w-full py-4 rounded-xl bg-brand-500 text-black font-black text-[11px] uppercase tracking-[2px] shadow-lg hover:shadow-brand-500/20 transition-all border-none cursor-pointer disabled:opacity-50">
                {savingSerie ? "PROCESANDO..." : editSerie ? "GUARDAR CAMBIOS" : "CREAR SERIE FISCAL"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de series */}
      {allSeries.map(serie => (
        <div key={serie.id} className="bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-md mb-4">
          {/* Header */}
          <div className={[
            "flex items-center gap-3 px-[18px] py-3.5",
            expandSerie === serie.id ? "border-b border-border dark:border-border-dark" : "",
          ].join(" ")}>
            <div className="flex-1">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-base text-brand-500">{serie.prefix}</span>
                <span className="text-content dark:text-content-dark font-bold">{serie.name}</span>
                <span className="text-[10px] bg-surface-3 dark:bg-surface-dark-3 border border-border dark:border-border-dark text-content-muted dark:text-content-dark-muted px-1.5 py-0.5 rounded">
                  {serie.padding} dígitos
                </span>
                {!serie.active && <span className="text-[10px] bg-danger/10 text-danger px-1.5 py-0.5 rounded">INACTIVA</span>}
              </div>
              <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">
                {(serie.SerieRanges||[]).filter(r=>r.active).length} rango(s) activo(s) · {(serie.Employees||[]).length} usuario(s)
              </div>
            </div>
            <button onClick={() => { setEditSerie({...serie}); setSerieForm({...serie}); setShowModal(true); }}
              className="px-5 py-2.5 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all font-black uppercase text-[10px] tracking-widest shadow-sm">
              Editar
            </button>
            <button onClick={() => setExpandSerie(expandSerie===serie.id ? null : serie.id)}
              className="px-5 py-2.5 rounded-xl bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all font-black uppercase text-[10px] tracking-widest shadow-sm">
              {expandSerie===serie.id ? "▲ Cerrar" : "▼ Gestionar"}
            </button>
            <button onClick={() => deleteSerie(serie.id)}
              className="p-2.5 px-3.5 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm text-sm"
              title="Eliminar Serie">
              ✕
            </button>
          </div>

          {/* Panel expandido */}
          {expandSerie === serie.id && (
            <div className="px-[18px] py-4 grid grid-cols-2 gap-5">
              {/* Rangos */}
              <div>
                <div className="font-bold text-[11px] tracking-[2px] mb-2.5 text-content-muted dark:text-content-dark-muted">RANGOS DE CORRELATIVOS</div>
                {(serie.SerieRanges||[]).map(r => (
                  <div key={r.id} className="flex items-center gap-2 mb-1.5 bg-surface-3 dark:bg-surface-dark-3 border border-border dark:border-border-dark rounded px-2.5 py-2">
                    <div className="flex-1 text-xs">
                      <span className={`font-bold ${r.active ? "text-success" : "text-content-muted dark:text-content-dark-muted"}`}>
                        {serie.prefix}-{String(r.start_number).padStart(serie.padding,'0')}
                      </span>
                      <span className="text-content-muted dark:text-content-dark-muted mx-1.5">→</span>
                      <span className={`font-bold ${r.active ? "text-success" : "text-content-muted dark:text-content-dark-muted"}`}>
                        {serie.prefix}-{String(r.end_number).padStart(serie.padding,'0')}
                      </span>
                      {r.active && (
                        <span className="ml-2 text-[10px] text-content-muted dark:text-content-dark-muted">
                          (actual: {serie.prefix}-{String(r.current_number).padStart(serie.padding,'0')})
                        </span>
                      )}
                      {!r.active && <span className="ml-2 text-[10px] text-danger">AGOTADO</span>}
                    </div>
                    <button onClick={() => deleteRange(r.id)}
                      className="btn-sm btn-danger px-1.5 py-0.5">✕</button>
                  </div>
                ))}
                {/* Añadir rango */}
                <div className="flex gap-2 mt-2.5">
                  <input type="number" placeholder="Inicio" value={rangeForm.start_number}
                    onChange={e => setRangeForm(p=>({...p,start_number:e.target.value}))}
                    className="input w-20" />
                  <input type="number" placeholder="Fin" value={rangeForm.end_number}
                    onChange={e => setRangeForm(p=>({...p,end_number:e.target.value}))}
                    className="input w-20" />
                  <button onClick={() => addRange(serie.id)}
                    className="btn-sm btn-success font-bold">
                    + Añadir
                  </button>
                </div>
              </div>

              {/* Usuarios asignados */}
              <div>
                <div className="font-bold text-[11px] tracking-[2px] mb-2.5 text-content-muted dark:text-content-dark-muted">USUARIOS ASIGNADOS</div>
                {allEmployees.map(emp => {
                  const assigned = (serie.Employees||[]).some(e => e.id === emp.id);
                  return (
                    <div key={emp.id} onClick={() => toggleUserSerie(serie, emp.id)}
                      className={[
                        "flex items-center gap-2 px-2 py-1.5 rounded mb-1 cursor-pointer border transition-colors",
                        assigned
                          ? "bg-success/10 border-success/50"
                          : "bg-surface-3 dark:bg-surface-dark-3 border-border dark:border-border-dark",
                      ].join(" ")}>
                      <div className={[
                        "w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors",
                        assigned ? "border-success bg-success" : "border-border dark:border-border-dark bg-transparent",
                      ].join(" ")}>
                        {assigned && <span className="text-black text-[9px] font-bold">✓</span>}
                      </div>
                      <span className={`text-xs ${assigned ? "text-content dark:text-content-dark" : "text-content-muted dark:text-content-dark-muted"}`}>{emp.full_name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {allSeries.length === 0 && (
        <div className="text-center py-10 text-content-muted dark:text-content-dark-muted">No hay series configuradas</div>
      )}
    </div>
  );
}
