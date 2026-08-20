import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";

const EMPTY_JOURNAL = { name: "", type: "", color: "#6366f1", active: true, bank_id: null, currency_id: null, warehouse_id: null };

export default function DiariosTab({ notify, can, journals, loadJournals, activeMethods, methodByCode, activeBanks, currencies, warehouses = [] }) {
  const [newJournal, setNewJournal] = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeModal = () => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); };

  // form y setter unificados para el modal
  const form = editJournal ?? newJournal;
  const setForm = (updater) => editJournal ? setEditJournal(updater) : setNewJournal(updater);

  const submitJournal = async () => {
    if (!form.name.trim()) return notify("El nombre es requerido", "err");
    try {
      if (editJournal) {
        await api.journals.update(editJournal.id, editJournal);
        notify("Diario actualizado");
      } else {
        await api.journals.create(newJournal);
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

  return (
    <>
      <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
          {journals.length} diario{journals.length !== 1 ? "s" : ""}
        </span>
        {can("config") && (
          <Button onClick={() => { setEditJournal(null); setNewJournal(EMPTY_JOURNAL); setShowModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
            + Nuevo Diario
          </Button>
        )}
      </div>

      <div className="card-premium overflow-auto flex-1">
      {journals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">No hay diarios configurados</div>
        </div>
      ) : (
        <table className="table-pos min-w-[680px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-12" />
                {["Nombre del Diario", "Método", "Banco / Entidad", "Sucursal", "Moneda", "Estado", can("config") && "Acciones"].filter(Boolean).map(h => (
                  <th key={h} className={h === "Acciones" ? "text-right pr-6" : h === "Moneda" || h === "Estado" ? "text-center" : "text-left"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {journals.map((j) => {
                const isEdit = editJournal?.id === j.id;
                return (
                  <tr key={j.id} className="group">
                    <td>
                      <div className="w-4 h-4 rounded-full shadow-sm" style={{ background: j.color }} />
                    </td>
                    <td>
                      {isEdit ? (
                        <input
                          autoFocus
                          value={editJournal.name}
                          onChange={e => setEditJournal(p => ({ ...p, name: e.target.value }))}
                          className="input"
                        />
                      ) : (
                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{j.name}</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const m = methodByCode[j.type];
                        return <span className="text-[10px] font-black text-content-subtle opacity-60 uppercase tracking-wide">{m ? m.name : (j.type || "—")}</span>;
                      })()}
                    </td>
                    <td>
                      <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest">{j.bank_name || j.bank || "—"}</span>
                    </td>
                    <td>
                      {j.warehouse_name
                        ? <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest">{j.warehouse_name}</span>
                        : <span className="badge badge-neutral shadow-none">Compartido</span>}
                    </td>
                    <td className="text-center">
                      {j.currency_code ? (
                        <span className="badge badge-info shadow-none">
                          {j.currency_symbol} {j.currency_code}
                        </span>
                      ) : <span className="opacity-30 text-[10px]">—</span>}
                    </td>
                    <td className="text-center">
                      <span className={`badge shadow-none ${j.active ? "badge-success" : "badge-danger"}`}>
                        {j.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="text-right pr-6">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditJournal({ ...j }); setShowModal(true); }}
                            className="p-2 rounded-xl transition-all text-content-subtle hover:text-warning hover:bg-warning/10 active:scale-90"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button
                            onClick={() => toggleJournal(j)}
                            className="p-2 rounded-xl transition-all text-content-subtle hover:text-info hover:bg-info/10 active:scale-90"
                            title={j.active ? "Desactivar" : "Activar"}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(j)}
                            className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90"
                            title="Eliminar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
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
                { value: "", label: "— Ninguno" },
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
                { value: "", label: "— Base" },
                ...currencies.map(c => ({ value: String(c.id), label: `${c.symbol} ${c.code}` })),
              ]}
              className="w-full"
            />
          </div>
        </div>
        {/* Sucursal dueña de la caja. "Compartido" es lo correcto para una cuenta bancaria
            de la empresa donde entran cobros de todas las tiendas; una caja de efectivo, en
            cambio, es de una sola. Solo se pregunta si hay más de una sucursal. */}
        {(warehouses.length > 1 || can("admin")) && (
          <div className="mb-3">
            <div className="label mb-1">Sucursal</div>
            <CustomSelect
              value={form.warehouse_id ? String(form.warehouse_id) : ""}
              onChange={v => setForm(p => ({ ...p, warehouse_id: v || null }))}
              options={[
                // Compartido alcanza a sucursales que un encargado no administra: el backend
                // se lo rechaza, así que tampoco se le ofrece.
                ...(can("admin") ? [{ value: "", label: "— Compartido (todas las sucursales)" }] : []),
                // Un depósito no cobra, así que no tiene caja: ofrecerlo acá sería crear
                // un diario donde nunca va a entrar dinero.
                ...warehouses.filter(w => w.sells !== false).map(w => ({ value: String(w.id), label: w.name })),
              ]}
              placeholder="Seleccionar sucursal..."
              className="w-full"
            />
            <div className="text-[10px] font-bold text-content-subtle mt-1 opacity-60">
              Con una sucursal elegida, esta caja solo aparece y suma en ella.
            </div>
          </div>
        )}

        <div className="mb-3">
          <div className="label mb-1">Banco asociado</div>
          <CustomSelect
            value={form.bank_id ? String(form.bank_id) : ""}
            onChange={v => setForm(p => ({ ...p, bank_id: v || null }))}
            options={[
              { value: "", label: "— Sin banco" },
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
        <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
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
    </>
  );
}
