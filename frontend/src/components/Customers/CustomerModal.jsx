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
      title={isEdit ? "EDITAR REGISTRO" : "NUEVO REGISTRO"}
      width={500}
    >

      {/* Selector de Tipo Estilo Segmentado con colores dinámicos */}
      <div className="flex p-1 bg-surface-2 dark:bg-white/5 rounded-xl mb-5 border border-white/5">
        <button
          onClick={() => setForm(p => ({ ...p, type: "cliente" }))}
          className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${!isProveedor
            ? "bg-brand-500 text-black shadow-lg"
            : "text-content-subtle hover:text-white"
            }`}
        >
          cliente
        </button>
        <button
          onClick={() => setForm(p => ({ ...p, type: "proveedor" }))}
          className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${isProveedor
            ? "bg-violet-600 text-white shadow-lg"
            : "text-content-subtle hover:text-white"
            }`}
        >
          proveedor
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Nombre - Color dinámico en el label */}
        <div className="col-span-2">
          <label className={`text-[10px] font-black uppercase mb-1 block ml-1 ${isProveedor ? "text-violet-400" : "text-brand-500"
            }`}>
            Razón Social / Nombre
          </label>
          <input
            value={form.name}
            onChange={set("name")}
            className={`w-full h-9 bg-surface-2 dark:bg-white/5 border rounded-xl px-3 text-[11px] font-bold outline-none transition-all ${isProveedor ? "border-violet-500/30 focus:border-violet-500" : "border-white/10 focus:border-brand-500/50"
              }`}
            placeholder="Ej: Inversiones Globales C.A."
          />
        </div>

        {/* RIF / Documento */}
        <div>
          <label className="text-[10px] font-black uppercase text-content-subtle mb-1 block ml-1">RIF / Cédula</label>
          <input
            value={form.rif}
            onChange={set("rif")}
            className="w-full h-9 bg-surface-2 dark:bg-white/5 border border-white/10 rounded-xl px-3 text-[11px] font-bold outline-none focus:border-brand-500/50 uppercase"
            placeholder="V-12345678"
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="text-[10px] font-black uppercase text-content-subtle mb-1 block ml-1">Teléfono</label>
          <input
            value={form.phone}
            onChange={set("phone")}
            className="w-full h-9 bg-surface-2 dark:bg-white/5 border border-white/10 rounded-xl px-3 text-[11px] font-bold"
            placeholder="0412..."
          />
        </div>

        {/* Correo */}
        <div className="col-span-2">
          <label className="text-[10px] font-black uppercase text-content-subtle mb-1 block ml-1">Email</label>
          <input
            value={form.email}
            onChange={set("email")}
            className="w-full h-9 bg-surface-2 dark:bg-white/5 border border-white/10 rounded-xl px-3 text-[11px] font-bold"
            placeholder="contacto@empresa.com"
          />
        </div>

        {/* Notas compactas */}
        <div className="col-span-2">
          <label className="text-[10px] font-black uppercase text-content-subtle mb-1 block ml-1">Notas Internas</label>
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={2}
            className="w-full bg-surface-2 dark:bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] font-bold resize-none outline-none focus:border-brand-500/50"
            placeholder="Observaciones..."
          />
        </div>
      </div>

      {/* Botonera centrada y con colores de acción dinámicos */}
      <div className="flex justify-center gap-4 mt-8 pt-4 border-t border-white/5">
        <Button
          variant="ghost"
          onClick={onClose}
          className="!text-[10px] min-w-[120px]"
        >
          CANCELAR
        </Button>
        <Button
          onClick={() => onSave(form)}
          loading={loading}
          className={`min-w-[160px] !text-[10px] ${isProveedor ? "!bg-violet-600 hover:!bg-violet-700 shadow-violet-500/20" : ""
            }`}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "REGISTRAR AHORA"}
        </Button>
      </div>
    </Modal>
  );
}