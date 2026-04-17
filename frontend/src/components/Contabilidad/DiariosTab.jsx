import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

const EMPTY_JOURNAL = { name: "", type: "", color: "#6366f1", active: true, bank_id: null, currency_id: null };

export default function DiariosTab({ notify, can, journals, loadJournals, activeMethods, methodByCode, activeBanks, currencies }) {
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

      <div className="flex-1 overflow-auto">
      {journals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-20">
          <div className="text-xs font-black uppercase tracking-wide">No hay diarios configurados</div>
        </div>
      ) : (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 dark:bg-surface-dark-2">
                <th className="w-12 px-4 py-3 border-b border-border/40 dark:border-white/5" />
                {["Nombre del Diario", "Método", "Banco / Entidad", "Moneda", "Estado", can("config") && "Acciones"].filter(Boolean).map(h => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : h === "Moneda" || h === "Estado" ? "text-center" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 dark:divide-white/5">
              {journals.map((j) => {
                const isEdit = editJournal?.id === j.id;
                return (
                  <tr key={j.id} className="hover:bg-brand-500/[0.02] transition-colors group">
                    <td className="px-4 py-3">
                      <div className="w-4 h-4 rounded-full shadow-sm" style={{ background: j.color }} />
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      {(() => {
                        const m = methodByCode[j.type];
                        return <span className="text-[10px] font-black text-content-subtle opacity-60 uppercase tracking-wide">{m ? `${m.icon || ""} ${m.name}`.trim() : (j.type || "—")}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-black text-content-subtle opacity-40 uppercase tracking-widest">{j.bank_name || j.bank || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {j.currency_code ? (
                        <span className="px-2 py-0.5 bg-brand-500/5 text-brand-500 rounded-md border border-brand-500/10 font-black text-[10px] uppercase tracking-wider">
                          {j.currency_symbol} {j.currency_code}
                        </span>
                      ) : <span className="opacity-30 text-[10px]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${j.active ? "text-success border-success/30 bg-success/5" : "text-danger border-danger/30 bg-danger/5"}`}>
                        {j.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {can("config") && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditJournal({ ...j }); setShowModal(true); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button
                            onClick={() => toggleJournal(j)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/10 text-info hover:bg-info hover:text-black transition-all"
                            title={j.active ? "Desactivar" : "Activar"}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" /></svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(j)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all"
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
            <select
              value={form.type || ""}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="input"
            >
              <option value="">— Ninguno</option>
              {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1">Moneda</div>
            <select
              value={form.currency_id || ""}
              onChange={e => setForm(p => ({ ...p, currency_id: e.target.value || null }))}
              className="input"
            >
              <option value="">— Base</option>
              {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-3">
          <div className="label mb-1">Banco asociado</div>
          <select
            value={form.bank_id || ""}
            onChange={e => setForm(p => ({ ...p, bank_id: e.target.value || null }))}
            className="input"
          >
            <option value="">— Sin banco</option>
            {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
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
