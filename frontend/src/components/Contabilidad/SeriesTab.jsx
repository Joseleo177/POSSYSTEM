import { useState } from "react";
import { api } from "../../services/api";
import Page from "../ui/Page";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

const EMPTY_SERIE = { name: "", prefix: "", padding: 4 };
const EMPTY_RANGE = { start_number: "", end_number: "" };

export default function SeriesTab({ notify, can, allSeries, loadAllSeries, allEmployees }) {
  const canConfig = can("config");
  const [serieForm, setSerieForm] = useState(EMPTY_SERIE);
  const [editSerie, setEditSerie] = useState(null);
  const [expandSerie, setExpandSerie] = useState(null);
  const [rangeForm, setRangeForm] = useState(EMPTY_RANGE);
  const [savingSerie, setSavingSerie] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeModal = () => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); };

  // form unificado para el modal
  const form = editSerie ?? serieForm;
  const setForm = (updater) => editSerie ? setEditSerie(updater) : setSerieForm(updater);

  const saveSerie = async () => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    if (!form.name || !form.prefix) return notify("Nombre y prefijo son requeridos", "err");
    setSavingSerie(true);
    try {
      if (editSerie) {
        await api.series.update(editSerie.id, form);
        notify("Serie actualizada");
      } else {
        await api.series.create(form);
        notify("Serie creada");
      }
      closeModal();
      loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
    finally { setSavingSerie(false); }
  };

  const deleteSerie = async (id) => {
    try { await api.series.remove(id); notify("Serie eliminada"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const addRange = async (serieId) => {
    if (!rangeForm.start_number || !rangeForm.end_number) return notify("Inicio y fin son requeridos", "err");
    try {
      await api.series.addRange(serieId, rangeForm);
      notify("Rango añadido"); setRangeForm(EMPTY_RANGE); loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
  };

  const deleteRange = async (rangeId) => {
    try { await api.series.removeRange(rangeId); notify("Rango eliminado"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const toggleUserSerie = async (serie, userId) => {
    const current = (serie.Employees || []).map(e => e.id);
    const updated = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId];
    try { await api.series.assignUsers(serie.id, { user_ids: updated }); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <Page
      module="CONFIGURACIÓN FISCAL"
      title="Series y Correlativos"
      actions={canConfig && (
        <Button onClick={() => { setEditSerie(null); setSerieForm(EMPTY_SERIE); setShowModal(true); }}>
          + Nueva Serie
        </Button>
      )}
    >
      {allSeries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">No hay series configuradas</div>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          {allSeries.map(serie => (
            <div key={serie.id} className="bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/5 rounded-lg overflow-hidden shadow-sm">
              {/* Cabecera de la serie */}
              <div className="px-4 py-3 flex items-center justify-between gap-4 bg-surface-1/50 dark:bg-white/[0.02] border-b border-border/20">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-brand-500 uppercase">{serie.prefix}</span>
                    <span className="font-black text-[12px] text-content dark:text-white uppercase tracking-tight">{serie.name}</span>
                  </div>
                  <div className="text-[10px] font-bold text-content-subtle opacity-60 uppercase tracking-widest mt-0.5">
                    {serie.padding} dígitos · {(serie.SerieRanges || []).filter(r => r.active).length} rangos activos
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-[10px] bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black shadow-none"
                    onClick={() => setExpandSerie(expandSerie === serie.id ? null : serie.id)}
                  >
                    {expandSerie === serie.id ? "Cerrar" : "Gestionar"}
                  </Button>
                  {canConfig && (
                    <>
                      <Button
                        variant="ghost"
                        className="h-8 px-3 text-[10px] bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black shadow-none"
                        onClick={() => { setEditSerie({ ...serie }); setShowModal(true); }}
                      >
                        Editar
                      </Button>
                      <button
                        onClick={() => setDeleteConfirm({ type: "serie", id: serie.id, name: serie.name })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Detalle expandido */}
              {expandSerie === serie.id && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Rangos */}
                  <div>
                    <div className="text-[10px] font-black tracking-wider uppercase text-content-subtle mb-3 opacity-60">Rangos de Correlativos</div>
                    <div className="space-y-2">
                      {(serie.SerieRanges || []).map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-surface-2 dark:bg-white/[0.03] rounded-lg border border-border/40">
                          <div className="flex flex-col">
                            <div className={`text-[11px] font-black ${r.active ? "text-success" : "text-content-subtle"}`}>
                              {serie.prefix}-{String(r.start_number).padStart(serie.padding, "0")} → {serie.prefix}-{String(r.end_number).padStart(serie.padding, "0")}
                            </div>
                            {r.active && (
                              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-0.5">
                                Actual: {serie.prefix}-{String(r.current_number).padStart(serie.padding, "0")}
                              </div>
                            )}
                          </div>
                          {canConfig && (
                            <button
                              onClick={() => setDeleteConfirm({ type: "range", id: r.id, name: `${serie.prefix}-${String(r.start_number).padStart(serie.padding, "0")} / ${serie.prefix}-${String(r.end_number).padStart(serie.padding, "0")}` })}
                              className="w-6 h-6 rounded-md bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {canConfig && (
                        <div className="flex gap-2 pt-2">
                          <input
                            type="number"
                            placeholder="Inicio"
                            value={rangeForm.start_number}
                            onChange={e => setRangeForm(p => ({ ...p, start_number: e.target.value }))}
                            className="input h-8 text-[11px]"
                          />
                          <input
                            type="number"
                            placeholder="Fin"
                            value={rangeForm.end_number}
                            onChange={e => setRangeForm(p => ({ ...p, end_number: e.target.value }))}
                            className="input h-8 text-[11px]"
                          />
                          <Button
                            className="h-8 px-3 text-[10px] bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none shrink-0"
                            onClick={() => addRange(serie.id)}
                          >
                            + Añadir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Usuarios */}
                  <div>
                    <div className="text-[10px] font-black tracking-wider uppercase text-content-subtle mb-3 opacity-60">Usuarios con Acceso</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allEmployees.map(emp => {
                        const assigned = (serie.Employees || []).some(e => e.id === emp.id);
                        return (
                          <div
                            key={emp.id}
                            onClick={() => canConfig && toggleUserSerie(serie, emp.id)}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${canConfig ? "cursor-pointer" : ""} ${assigned ? "bg-success/5 border-success/30" : "bg-surface-2 dark:bg-white/[0.03] border-border/40"}`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${assigned ? "bg-success border-success" : "border-border/60"}`}>
                              {assigned && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className={`text-[11px] font-black uppercase truncate ${assigned ? "text-content dark:text-white" : "text-content-subtle"}`}>
                              {emp.full_name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: crear / editar */}
      <Modal
        open={showModal || !!editSerie}
        onClose={closeModal}
        title={editSerie ? "Editar Serie" : "Nueva Serie Fiscal"}
        width={420}
      >
        <div className="mb-3">
          <div className="label mb-1">Nombre de la serie *</div>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="ej. Facturación Principal"
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="label mb-1">Prefijo *</div>
            <input
              value={form.prefix}
              onChange={e => setForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))}
              placeholder="ej. A"
              className="input"
              maxLength={10}
            />
          </div>
          <div>
            <div className="label mb-1">Dígitos</div>
            <input
              type="number"
              min={1}
              max={8}
              value={form.padding}
              onChange={e => setForm(p => ({ ...p, padding: parseInt(e.target.value) || 4 }))}
              className="input text-center"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
          <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
          <Button variant="primary" onClick={saveSerie} disabled={savingSerie}>
            {savingSerie ? "Guardando..." : editSerie ? "Guardar cambios" : "Crear serie"}
          </Button>
        </div>
      </Modal>

      {/* Confirm: eliminar */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={deleteConfirm?.type === "serie" ? "¿Eliminar serie fiscal?" : "¿Eliminar rango?"}
        message={deleteConfirm?.type === "serie" ? `Estás a punto de eliminar la serie "${deleteConfirm?.name}".` : `¿Eliminar correlativo ${deleteConfirm?.name}?`}
        onConfirm={async () => {
          if (deleteConfirm.type === "serie") await deleteSerie(deleteConfirm.id);
          else await deleteRange(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </Page>
  );
}
