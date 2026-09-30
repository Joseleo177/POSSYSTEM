import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import StatusMark, { ACTIVE_STATUS } from "../ui/StatusMark";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon } from "../ui/Ledger";
import { toNameCase } from "../../helpers";

const EMPTY_JOURNAL = { name: "", type: "", color: "#6366f1", active: true, bank_id: null, currency_id: null, warehouse_ids: [] };

export default function DiariosTab({ notify, can, journals, loadJournals, activeMethods, methodByCode, activeBanks, currencies, warehouses = [] }) {
  const [newJournal, setNewJournal] = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeModal = () => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); };

  // Diarios que comparten método + banco + moneda + el MISMO juego de sucursales: son la
  // misma caja repetida. El backend ya no deja crear nuevos; esto marca los viejos.
  const dupKey = (j) => `${j.type || ""}|${j.bank_id || ""}|${j.currency_id || ""}|${[...(j.warehouse_ids || [])].sort((a, b) => a - b).join(",")}`;
  const dupIds = (() => {
    const byKey = {};
    (journals || []).forEach(j => {
      const k = dupKey(j);
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(j.id);
    });
    return new Set(Object.values(byKey).filter(ids => ids.length > 1).flat());
  })();

  // form y setter unificados para el modal
  const form = editJournal ?? newJournal;
  const setForm = (updater) => editJournal ? setEditJournal(updater) : setNewJournal(updater);

  const submitJournal = async () => {
    if (!form.name.trim()) return notify("El nombre es requerido", "err");
    // Sin selector de sucursales visible (un solo local, sin permiso admin) no se manda el
    // campo: el backend conserva lo que el diario ya tenía y, al crear, usa el local propio.
    const puedeElegirSedes = warehouses.length > 1 || can("admin");
    const clean = (obj) => {
      const c = { ...obj };
      if (!puedeElegirSedes) delete c.warehouse_ids;
      delete c.warehouse_id; delete c.warehouse_name; delete c.warehouse_names;
      return c;
    };
    try {
      if (editJournal) {
        await api.journals.update(editJournal.id, clean(editJournal));
        notify("Diario actualizado");
      } else {
        await api.journals.create(clean(newJournal));
        notify("Diario creado");
      }
      closeModal();
      loadJournals();
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

  const canManage = can("journals.manage");
  const abrirNuevo  = () => { setEditJournal(null); setNewJournal(EMPTY_JOURNAL); setShowModal(true); };
  const abrirEditar = (j) => { setEditJournal({ ...j, warehouse_ids: [...(j.warehouse_ids || [])] }); setShowModal(true); };

  // Textos de la fila, en caja de oración: los nombres venían en mayúsculas y competían.
  const metodoDe   = (j) => methodByCode[j.type]?.name || j.type || "Sin método";
  const sucursalDe = (j) => (j.warehouse_ids?.length ?? 0) === 0
    ? "Todas las sucursales"
    : j.warehouse_ids.length === 1
      ? toNameCase(j.warehouse_names?.[0] || j.warehouse_name)
      : `${j.warehouse_ids.length} sucursales`;
  const monedaDe   = (j) => j.currency_code ? `${j.currency_symbol} ${j.currency_code}` : "Moneda base";
  const DUP_TONE   = "#ef4444";

  // Acciones siempre a la vista: en una tablet no hay hover que las descubra.
  const acciones = (j) => canManage ? (
    <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
      <RowIcon icon="edit" title="Editar diario" onClick={() => abrirEditar(j)} />
      <RowIcon icon="power" title={j.active ? "Desactivar" : "Activar"} onClick={() => toggleJournal(j)} />
      <RowIcon icon="trash" tone="danger" title="Eliminar diario" onClick={() => setDeleteConfirm(j)} />
    </div>
  ) : null;

  const nombre = (j) => (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-transparent shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: j.color }} />
      <div className="min-w-0">
        <div className={`text-[13px] font-semibold truncate ${j.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(j.name)}</div>
        {dupIds.has(j.id) && (
          <div className="text-[12px] font-medium text-red-600 dark:text-red-400 truncate" title="Otro diario tiene el mismo método, banco, moneda y sucursales. Desactívalo o elimínalo.">
            Duplicado de otra caja
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[13px] text-content-subtle">
          {journals.length} diario{journals.length !== 1 ? "s" : ""}
        </span>
        {canManage && <Button onClick={abrirNuevo}>+ Nuevo diario</Button>}
      </div>

      {/* ── Libro (escritorio) ── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="table-ledger min-w-[820px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="pl-4">Diario</th>
              <th>Método y banco</th>
              <th>Sucursal</th>
              <th>Moneda</th>
              <th>Estado</th>
              <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {journals.length === 0 ? (
              <LedgerEmpty cols={6} title="Sin diarios" hint="Cada caja o cuenta bancaria por la que entra o sale dinero es un diario." />
            ) : journals.map(j => (
              <tr key={j.id} {...ledgerRow(canManage ? () => abrirEditar(j) : undefined, dupIds.has(j.id) ? DUP_TONE : undefined)}>
                <td className="pl-4 max-w-0 w-[26%]">{nombre(j)}</td>
                <td className="max-w-0">
                  <div className="text-[13px] text-content dark:text-white truncate">{metodoDe(j)}</div>
                  <div className="text-[12px] text-content-subtle truncate">{toNameCase(j.bank_name || j.bank) || "Sin banco"}</div>
                </td>
                <td>
                  <span className="text-[13px] text-content-subtle whitespace-nowrap" title={(j.warehouse_names || []).join(", ") || undefined}>{sucursalDe(j)}</span>
                </td>
                <td><span className="text-[13px] text-content dark:text-white tabular-nums whitespace-nowrap">{monedaDe(j)}</span></td>
                <td><StatusMark status={j.active ? "activo" : "inactivo"} map={ACTIVE_STATUS} /></td>
                <td className="pr-4 whitespace-nowrap cursor-default">{acciones(j)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (teléfono) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {journals.length === 0 ? (
          <div className="py-16 text-center px-6">
            <div className="text-[14px] font-semibold text-content dark:text-white">Sin diarios</div>
            <div className="text-[13px] text-content-subtle mt-1">Cada caja o cuenta bancaria por la que entra o sale dinero es un diario.</div>
          </div>
        ) : journals.map(j => (
          <div key={j.id}
            style={dupIds.has(j.id) ? { boxShadow: `inset 3px 0 0 ${DUP_TONE}` } : undefined}
            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-1.5 py-3">
            <div className="flex items-center justify-between gap-2">
              {nombre(j)}
              {acciones(j)}
            </div>
            <div className="mt-1.5 pl-5 text-[12px] text-content-subtle truncate">
              {metodoDe(j)} · {monedaDe(j)} · {sucursalDe(j)}
            </div>
            {!j.active && <div className="mt-1 pl-5"><StatusMark status="inactivo" map={ACTIVE_STATUS} /></div>}
          </div>
        ))}
      </div>

      {/* Modal: crear / editar */}
      <Modal
        open={showModal || !!editJournal}
        onClose={closeModal}
        title={editJournal ? "Editar Diario" : "Nueva Caja / Diario"}
        width={460}
      >
        <div className="mb-3">
          <div className="label mb-1">Nombre del diario *</div>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="ej. Caja Principal USD"
            className="input"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="label mb-1">Método de pago</div>
            {/* payment_methods no tiene columna `icon`: la plantilla anterior dejaba un
                hueco delante de cada nombre. */}
            <CustomSelect
              value={form.type || ""}
              onChange={v => setForm(p => ({ ...p, type: v }))}
              options={[
                { value: "", label: "Ninguno" },
                ...activeMethods.map(m => ({ value: m.code, label: m.name })),
              ]}
              className="w-full"
            />
          </div>
          <div>
            <div className="label mb-1">Moneda</div>
            <CustomSelect
              value={form.currency_id ? String(form.currency_id) : ""}
              onChange={v => setForm(p => ({ ...p, currency_id: v || null }))}
              options={[
                { value: "", label: "Base" },
                ...currencies.map(c => ({ value: String(c.id), label: `${c.symbol} ${c.code}` })),
              ]}
              className="w-full"
            />
          </div>
        </div>
        {/* Sucursales que atienden esta caja. Ninguna marcada = todas (compartido), lo
            correcto para una cuenta bancaria de la empresa. Un depósito no cobra, así que no
            se ofrece. Solo se pregunta si hay más de una sucursal. */}
        {(warehouses.length > 1 || can("admin")) && (() => {
          const sedes = warehouses.filter(w => w.sells !== false);
          const marcadas = form.warehouse_ids || [];
          const toggle = (id) => setForm(p => {
            const cur = p.warehouse_ids || [];
            return { ...p, warehouse_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
          });
          return (
            <div className="mb-3">
              <div className="label mb-1">Sucursales de la caja</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, warehouse_ids: [] }))}
                  className={`px-2.5 h-7 rounded-lg text-[11px] font-bold border transition-all ${marcadas.length === 0 ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-500/40"}`}>
                  Todas
                </button>
                {sedes.map(w => (
                  <button key={w.id} type="button"
                    onClick={() => toggle(w.id)}
                    className={`px-2.5 h-7 rounded-lg text-[11px] font-bold border transition-all ${marcadas.includes(w.id) ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-500/40"}`}>
                    {w.name}
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-semibold text-content-subtle mt-1 opacity-60">
                {marcadas.length === 0
                  ? "Aparece y suma en todas las sucursales."
                  : `Solo aparece y suma en ${marcadas.length === 1 ? "esa sucursal" : `esas ${marcadas.length} sucursales`}.`}
              </div>
            </div>
          );
        })()}

        <div className="mb-3">
          <div className="label mb-1">Banco asociado</div>
          <CustomSelect
            value={form.bank_id ? String(form.bank_id) : ""}
            onChange={v => setForm(p => ({ ...p, bank_id: v || null }))}
            options={[
              { value: "", label: "Sin banco" },
              ...activeBanks.map(b => ({ value: String(b.id), label: b.name })),
            ]}
            className="w-full"
          />
        </div>
        <div className="mb-4">
          <div className="label mb-1">Color identificador</div>
          <input
            type="color"
            value={form.color}
            onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
            className="w-full h-9 p-1 bg-white border border-border/40 rounded-lg cursor-pointer"
          />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
          <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
          <Button variant="primary" onClick={submitJournal}>
            {editJournal ? "Guardar cambios" : "Crear diario"}
          </Button>
        </div>
      </Modal>

      {/* Confirm: eliminar */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar diario?"
        message={`Estás a punto de eliminar el diario "${deleteConfirm?.name}". Esta acción no se puede deshacer.`}
        onConfirm={async () => { await deleteJournal(deleteConfirm.id); setDeleteConfirm(null); }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </div>
  );
}
