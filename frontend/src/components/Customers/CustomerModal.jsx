import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

const EMPTY = {
  type: "cliente",
  name: "",
  phone: "",
  email: "",
  address: "",
  rif: "",
  tax_name: "",
  notes: "",
};

export default function CustomerModal({ open, onClose, onSave, editData, loading }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      if (editData?.id) {
        // Si hay ID, estamos editando
        setForm({ ...editData });
      } else {
        // Si no hay ID, es un registro nuevo
        setForm({
          ...EMPTY,
          type: editData?._newType || "cliente",
          name: editData?._newName || ""
        });
      }
    }
  }, [open, editData]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const isProveedor = form.type === "proveedor";
  const isEdit = !!editData?.id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar contacto" : "Nuevo contacto"}
      width={520}
    >
      <div className="space-y-5">
        {/* Selector de Tipo Segmentado Premium */}
        <div className="flex p-1 bg-surface-3 dark:bg-white/5 rounded-xl border border-border/10">
          <button
            onClick={() => setForm(p => ({ ...p, type: "cliente" }))}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all ${!isProveedor
              ? "bg-brand-500 text-black shadow-lg shadow-brand-500/20"
              : "text-content-subtle hover:text-content hover:bg-white/5"
              }`}
          >
            CLIENTE
          </button>
          <button
            onClick={() => setForm(p => ({ ...p, type: "proveedor" }))}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all ${isProveedor
              ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
              : "text-content-subtle hover:text-content hover:bg-white/5"
              }`}
          >
            PROVEEDOR
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Nombre */}
          <div className="col-span-2">
            <label className={`label mb-1.5 ${isProveedor ? "text-violet-500" : "text-brand-500"}`}>
              Razón Social / Nombre Completo <span className="text-danger">*</span>
            </label>
            <input
              value={form.name}
              onChange={set("name")}
              className={`input h-10 font-black uppercase tracking-tight ${isProveedor ? "focus:border-violet-500/50" : ""}`}
              placeholder="Ej: Inversiones Globales C.A."
            />
          </div>

          {/* RIF / Documento */}
          <div>
            <label className="label mb-1.5 opacity-70">Identificación (RIF/CI)</label>
            <input
              value={form.rif}
              onChange={set("rif")}
              className="input h-10 font-bold uppercase tabular-nums"
              placeholder="V-00000000-0"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="label mb-1.5 opacity-70">Teléfono móvil</label>
            <input
              value={form.phone}
              onChange={set("phone")}
              className="input h-10 font-bold tabular-nums"
              placeholder="+58 412 0000000"
            />
          </div>

          {/* Correo */}
          <div className="col-span-2">
            <label className="label mb-1.5 opacity-70">Correo electrónico</label>
            <input
              value={form.email}
              onChange={set("email")}
              className="input h-10 font-bold lowercase"
              placeholder="ejemplo@dominio.com"
            />
          </div>

          {/* Notas */}
          <div className="col-span-2">
            <label className="label mb-1.5 opacity-70">Observaciones internas</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              className="input min-h-[80px] py-3 resize-none text-[11px] font-medium leading-relaxed"
              placeholder="Detalles adicionales sobre este contacto..."
            />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-border/10 dark:border-white/5">
        <Button
          variant="ghost"
          onClick={onClose}
          className="h-10 px-6 font-black tracking-widest text-[10px] uppercase"
        >
          CANCELAR
        </Button>
        <Button
          onClick={() => onSave(form)}
          loading={loading}
          className={`h-10 px-8 shadow-xl font-black tracking-[0.2em] text-[10px] uppercase ${isProveedor ? "bg-violet-600 hover:bg-violet-700 shadow-violet-600/20" : ""}`}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "REGISTRAR CONTACTO"}
        </Button>
      </div>
    </Modal>
  );
}