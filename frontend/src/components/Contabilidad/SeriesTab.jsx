import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import { toNameCase } from "../../helpers";
import Check from "../ui/Check";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon, RowCta } from "../ui/Ledger";

const EMPTY_SERIE = { name: "", prefix: "", padding: 4, type: "factura", warehouse_id: "" };

const SERIE_TYPES = [
  { value: "factura", label: "Factura / recibo", color: "brand" },
  { value: "nc",      label: "Nota de crédito",  color: "warning" },
];
const EMPTY_RANGE = { start_number: "", end_number: "" };

const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white tabular-nums placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Número con el formato de la serie: "A-0095".
const numero = (serie, n) => `${serie.prefix}-${String(n).padStart(serie.padding || 4, "0")}`;
const tipoSerie = (serie) => serie.type === "nc" ? "Nota de crédito" : "Factura";

// Color = señal: el rango que se está por acabar en ámbar, el agotado (o la serie sin rango,
// que tampoco puede facturar) en rojo. Lo normal va en gris.
const TONO_TEXTO  = { danger: "text-red-600 dark:text-red-400", warning: "text-amber-700 dark:text-amber-400" };
const TONO_BARRA  = { danger: "bg-red-500", warning: "bg-amber-500" };
const TONO_FILETE = { danger: "#ef4444", warning: "#f59e0b" };

// Cómo va el rango vigente: por dónde va y cuántos números le quedan. Es lo que hay que mirar
// en esta pantalla — una serie que se queda sin correlativos deja la caja sin poder facturar,
// y hasta ahora no había forma de verlo sin abrir cada una.
const estadoRango = (serie) => {
  const r = (serie.SerieRanges || []).find(x => x.active);
  if (!r) return { rango: null, tone: "danger", texto: "Sin rango activo" };
  const actual = r.current_number ?? r.start_number;
  const total  = Math.max(1, r.end_number - r.start_number + 1);
  const quedan = Math.max(0, r.end_number - actual);
  const pct    = Math.min(100, (Math.max(0, actual - r.start_number) / total) * 100);
  const tone   = quedan === 0 ? "danger" : (quedan <= 20 || pct >= 90) ? "warning" : null;
  const texto  = quedan === 0 ? "Rango agotado" : `Quedan ${quedan.toLocaleString("es-VE")}`;
  return { rango: r, actual, pct, quedan, tone, texto };
};

// Barra del rango vigente con el número por el que va.
function Numeracion({ serie }) {
  const e = estadoRango(serie);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[12px] tabular-nums">
        <span className="text-content dark:text-white font-medium truncate">
          {e.rango ? `Va por ${numero(serie, e.actual)}` : "—"}
        </span>
        <span className={`whitespace-nowrap ${TONO_TEXTO[e.tone] ? `font-medium ${TONO_TEXTO[e.tone]}` : "text-content-subtle"}`}>{e.texto}</span>
      </div>
      {e.rango && (
        <div className="mt-1.5 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
          <div className={`h-full rounded-full ${TONO_BARRA[e.tone] || "bg-content-subtle/50"}`} style={{ width: `${e.pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function SeriesTab({ notify, can, allSeries, loadAllSeries, allEmployees, allWarehouses = [] }) {
  // La numeración fiscal tiene su propio permiso desde que `config` dejó de ser un segundo
  // administrador. Preguntar por el viejo dejaba el botón a la vista de cualquiera que
  // tuviera alguna acción del mapa de compatibilidad, y el servidor después lo rebotaba.
  const canConfig = can("series.manage");
  const [serieForm, setSerieForm] = useState(EMPTY_SERIE);
  const [editSerie, setEditSerie] = useState(null);
  // Guardamos el id, no una copia: tras cada loadAllSeries() el modal tiene que
  // reflejar los rangos nuevos/borrados sin cerrarse.
  const [manageSerieId, setManageSerieId] = useState(null);
  const [rangeForm, setRangeForm] = useState(EMPTY_RANGE);
  const [savingSerie, setSavingSerie] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeModal = () => { setShowModal(false); setEditSerie(null); setSerieForm(EMPTY_SERIE); };

  const manageSerie = manageSerieId ? allSeries.find(s => s.id === manageSerieId) : null;
  const closeManage = () => { setManageSerieId(null); setRangeForm(EMPTY_RANGE); };

  // form unificado para el modal
  const form = editSerie ?? serieForm;
  const setForm = (updater) => editSerie ? setEditSerie(updater) : setSerieForm(updater);

  const saveSerie = async () => {
    if (!canConfig) return notify("No tienes permisos para esta acción", "err");
    if (!form.name || !form.prefix) return notify("Nombre y prefijo son requeridos", "err");
    if (!form.warehouse_id) return notify("Selecciona la sucursal a la que pertenece la serie", "err");
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
    const start = parseInt(rangeForm.start_number);
    const end   = parseInt(rangeForm.end_number);
    if (end <= start) return notify("El fin debe ser mayor que el inicio", "err");

    const serie = allSeries.find(s => s.id === serieId);
    const overlap = (serie?.SerieRanges || []).find(r => start <= r.end_number && end >= r.start_number);
    if (overlap) {
      const pad = serie.padding || 4;
      const fmt = (n) => `${serie.prefix}-${String(n).padStart(pad, "0")}`;
      return notify(`Se solapa con ${fmt(overlap.start_number)} → ${fmt(overlap.end_number)}`, "err");
    }

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

  const abrirNueva  = () => { setEditSerie(null); setSerieForm(EMPTY_SERIE); setShowModal(true); };
  const abrirEditar = (serie) => { setEditSerie({ ...serie }); setShowModal(true); };
  const pedirBorrar = (serie) => setDeleteConfirm({ type: "serie", id: serie.id, name: serie.name });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[13px] text-content-subtle">
          {allSeries.length} serie{allSeries.length !== 1 ? "s" : ""}
        </span>
        {canConfig && <Button onClick={abrirNueva}>+ Nueva serie</Button>}
      </div>

      {/* ── Libro (escritorio) ── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="table-ledger min-w-[760px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="pl-4">Serie</th>
              <th>Sucursal</th>
              <th className="w-[280px]">Numeración</th>
              <th>Usuarios</th>
              <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {allSeries.length === 0 ? (
              <LedgerEmpty cols={5} title="Sin series" hint="Cada sucursal necesita una serie para poder facturar." />
            ) : allSeries.map(serie => {
              const e = estadoRango(serie);
              const usuarios = (serie.Employees || []).length;
              return (
                <tr key={serie.id} {...ledgerRow(() => setManageSerieId(serie.id), TONO_FILETE[e.tone])}>
                  <td className="pl-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="min-w-8 h-8 px-1.5 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                        {serie.prefix}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{serie.name}</div>
                        <div className="text-[12px] text-content-subtle">{tipoSerie(serie)} · {serie.padding} dígitos</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="text-[13px] text-content dark:text-white">{toNameCase(serie.Warehouse?.name) || "Sin sucursal"}</span></td>
                  <td><Numeracion serie={serie} /></td>
                  <td>
                    <span className="text-[13px] text-content-subtle tabular-nums">
                      {usuarios === 0 ? "Nadie asignado" : `${usuarios} ${usuarios === 1 ? "usuario" : "usuarios"}`}
                    </span>
                  </td>
                  <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                    <div className="flex items-center justify-end gap-0.5">
                      <RowCta onClick={() => setManageSerieId(serie.id)}>Numeración</RowCta>
                      {canConfig && <RowIcon icon="edit" title="Editar serie" onClick={() => abrirEditar(serie)} />}
                      {canConfig && <RowIcon icon="trash" tone="danger" title="Eliminar serie" onClick={() => pedirBorrar(serie)} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (teléfono) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {allSeries.length === 0 ? (
          <div className="py-16 text-center px-6">
            <div className="text-[14px] font-semibold text-content dark:text-white">Sin series</div>
            <div className="text-[13px] text-content-subtle mt-1">Cada sucursal necesita una serie para poder facturar.</div>
          </div>
        ) : allSeries.map(serie => {
          const e = estadoRango(serie);
          return (
            <div key={serie.id} role="button" tabIndex={0}
              onClick={() => setManageSerieId(serie.id)}
              onKeyDown={ev => { if (ev.key === "Enter") setManageSerieId(serie.id); }}
              style={TONO_FILETE[e.tone] ? { boxShadow: `inset 3px 0 0 ${TONO_FILETE[e.tone]}` } : undefined}
              className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-content dark:text-white truncate">
                    <span className="text-content-subtle font-medium mr-1.5 tabular-nums">{serie.prefix}</span>{serie.name}
                  </div>
                  <div className="text-[12px] text-content-subtle">{tipoSerie(serie)} · {toNameCase(serie.Warehouse?.name) || "Sin sucursal"}</div>
                </div>
                {canConfig && (
                  <div className="flex items-center shrink-0" onClick={stopRow}>
                    <RowIcon icon="edit" title="Editar serie" onClick={() => abrirEditar(serie)} />
                    <RowIcon icon="trash" tone="danger" title="Eliminar serie" onClick={() => pedirBorrar(serie)} />
                  </div>
                )}
              </div>
              <div className="mt-2.5"><Numeracion serie={serie} /></div>
            </div>
          );
        })}
      </div>

      {/* Modal: gestionar rangos y usuarios */}
      <Modal
        open={!!manageSerie}
        onClose={closeManage}
        title={manageSerie ? `Numeración · ${manageSerie.name}` : ""}
        width={680}
      >
        {manageSerie && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rangos */}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-content dark:text-white">Rangos de correlativos</p>
              <p className="text-[12px] text-content-subtle mb-2">Se factura con el rango activo, en orden.</p>
              <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                {(manageSerie.SerieRanges || []).length === 0 && (
                  <p className="px-3.5 py-5 text-center text-[13px] text-content-subtle">Sin rangos. Agrega uno para poder facturar.</p>
                )}
                {(manageSerie.SerieRanges || []).map(r => {
                  const actual = r.current_number ?? r.start_number;
                  const total  = Math.max(1, r.end_number - r.start_number + 1);
                  const pct    = Math.min(100, (Math.max(0, actual - r.start_number) / total) * 100);
                  const quedan = Math.max(0, r.end_number - actual);
                  const tone   = !r.active ? null : quedan === 0 ? "danger" : (quedan <= 20 || pct >= 90) ? "warning" : null;
                  return (
                    <div key={r.id} className="px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-[13px] font-semibold tabular-nums ${r.active ? "text-content dark:text-white" : "text-content-subtle"}`}>
                          {numero(manageSerie, r.start_number)} → {numero(manageSerie, r.end_number)}
                        </span>
                        {canConfig && (
                          <RowIcon icon="trash" tone="danger" title="Eliminar rango" className="-mr-1.5 -my-1"
                            onClick={() => setDeleteConfirm({ type: "range", id: r.id, name: `${numero(manageSerie, r.start_number)} / ${numero(manageSerie, r.end_number)}` })} />
                        )}
                      </div>
                      {r.active ? (
                        <>
                          <div className="flex items-baseline justify-between gap-3 mt-0.5 text-[12px] tabular-nums">
                            <span className="text-content-subtle">Va por {numero(manageSerie, actual)}</span>
                            <span className={tone ? `font-medium ${TONO_TEXTO[tone]}` : "text-content-subtle"}>
                              {quedan === 0 ? "Agotado" : `Quedan ${quedan.toLocaleString("es-VE")}`}
                            </span>
                          </div>
                          <div className="mt-2 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                            <div className={`h-full rounded-full ${TONO_BARRA[tone] || "bg-content-subtle/50"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      ) : (
                        <p className="text-[12px] text-content-subtle mt-0.5">Inactivo</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {canConfig && (
                <div className="mt-3">
                  <p className="text-[12px] font-medium text-content-subtle mb-1.5">Nuevo rango</p>
                  <div className="flex gap-2">
                    <input
                      type="number" inputMode="numeric"
                      placeholder="Desde"
                      value={rangeForm.start_number}
                      onChange={e => setRangeForm(p => ({ ...p, start_number: e.target.value }))}
                      className={`${INPUT} min-w-0`}
                    />
                    <input
                      type="number" inputMode="numeric"
                      placeholder="Hasta"
                      value={rangeForm.end_number}
                      onChange={e => setRangeForm(p => ({ ...p, end_number: e.target.value }))}
                      className={`${INPUT} min-w-0`}
                    />
                    <button onClick={() => addRange(manageSerie.id)}
                      className="btn-outline h-10 px-3.5 rounded-lg text-[13px] font-medium shrink-0 inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                      Añadir
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Usuarios */}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-content dark:text-white">Quién factura con esta serie</p>
              <p className="text-[12px] text-content-subtle mb-2">
                {(manageSerie.Employees || []).length} de {allEmployees.length} marcados
              </p>
              {allEmployees.length === 0 ? (
                <p className="text-[12px] text-content-subtle leading-relaxed">
                  No tienes permiso para gestionar usuarios, así que no se puede asignar
                  quién factura con esta serie. Pídeselo a un administrador.
                </p>
              ) : (
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                  {allEmployees.map(emp => {
                    const assigned = (manageSerie.Employees || []).some(e => e.id === emp.id);
                    return (
                      <div
                        key={emp.id}
                        role="presentation"
                        onClick={() => canConfig && toggleUserSerie(manageSerie, emp.id)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 ${canConfig ? "cursor-pointer hover:bg-surface-2/70 dark:hover:bg-white/[0.025]" : ""} transition-colors`}
                      >
                        <Check checked={assigned} disabled={!canConfig} onChange={() => toggleUserSerie(manageSerie, emp.id)} title={toNameCase(emp.full_name)} />
                        {/* Sin cortar con "…": en columnas angostas un nombre con apellido
                            quedaba en "GABRIELA BA…" y no se sabía a quién se le daba acceso. */}
                        <span title={emp.full_name}
                          className={`min-w-0 text-[13px] leading-tight break-words ${assigned ? "font-medium text-content dark:text-white" : "text-content-muted dark:text-white/70"}`}>
                          {toNameCase(emp.full_name)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: crear / editar */}
      <Modal
        open={showModal || !!editSerie}
        onClose={closeModal}
        title={editSerie ? "Editar Serie" : "Nueva Serie Fiscal"}
        width={420}
      >
        <div className="mb-3">
          <div className="label mb-1">Tipo de serie *</div>
          <div className="flex gap-2">
            {SERIE_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(p => ({ ...p, type: t.value }))}
                className={[
                  "flex-1 py-2.5 rounded-xl border-2 text-[12px] font-bold transition-all",
                  form.type === t.value
                    ? t.value === "nc"
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-brand-500 bg-brand-500/10 text-brand-500"
                    : "border-border/40 dark:border-white/10 text-content-subtle hover:border-border dark:hover:border-white/20"
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3">
          <div className="label mb-1">Sucursal *</div>
          <CustomSelect
            value={form.warehouse_id ?? ""}
            onChange={val => setForm(p => ({ ...p, warehouse_id: val }))}
            // Un depósito no factura: ofrecerle una serie es prometer una numeración que
            // nunca va a usar.
            options={allWarehouses.filter(w => w.active && w.sells !== false).map(w => ({ value: w.id, label: w.name }))}
            placeholder="Seleccionar sucursal..."
            className="w-full"
          />
          <div className="text-[11px] font-semibold text-content-subtle mt-1 opacity-60">
            Cada sucursal lleva su propia numeración. No se puede cambiar una vez que la serie emitió documentos.
          </div>
        </div>
        {form.type === "factura" && (
          <div className="mb-3">
            <div className="label mb-1">Serie de N/C Vinculada (Opcional)</div>
            <CustomSelect
              value={form.nc_serie_id ?? ""}
              onChange={val => setForm(p => ({ ...p, nc_serie_id: val }))}
              options={[{ value: "", label: "Ninguna (Se usará la primera N/C de la sucursal)" }, ...allSeries.filter(s => s.type === "nc" && (!form.warehouse_id || s.warehouse_id === form.warehouse_id)).map(s => ({ value: s.id, label: `${s.name} (${s.prefix})` }))]}
              placeholder="Seleccionar serie N/C..."
              className="w-full"
            />
            <div className="text-[11px] font-semibold text-content-subtle mt-1 opacity-60">
              Las devoluciones de esta factura usarán esta serie para numerar la Nota de Crédito.
            </div>
          </div>
        )}
        <div className="mb-3">
          <div className="label mb-1">Nombre de la serie *</div>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder={form.type === "nc" ? "ej. Notas de Crédito" : "ej. Facturación Principal"}
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
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
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
    </div>
  );
}
