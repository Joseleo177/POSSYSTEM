import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

const DOC_PREFIXES = ["V", "E", "J", "G", "P"];
const RIF_PREFIXES = ["J", "G", "P"];

const EMPTY = {
  type: "cliente",
  name: "",
  phone: "",
  email: "",
  address: "",
  doc_prefix: "V",
  rif: "",
  tax_name: "",
  notes: "",
};

export default function CustomerModal({ open, onClose, onSave, editData, loading }) {
  const [form, setForm] = useState(EMPTY);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (editData?.id) {
        const fullRif = editData.rif || "";
        const match = fullRif.match(/^([VEJGP])-(.*)$/);
        setForm({
          ...editData,
          doc_prefix: match ? match[1] : "V",
          rif: match ? match[2] : fullRif,
        });
      } else {
        setForm({
          ...EMPTY,
          type: editData?._newType || "cliente",
          name: editData?._newName || editData?.name || "",
        });
      }
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [open, editData]);

  const isProveedor = form.type === "proveedor";
  const isEdit = !!editData?.id;
  const isRif = RIF_PREFIXES.includes(form.doc_prefix);
  const maxRifLen = isRif ? 9 : 8;
  const canSave = !!form.name.trim();

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      ...form,
      name: (form.name || "").trim(),
      phone: (form.phone || "").trim(),
      email: (form.email || "").trim(),
      address: (form.address || "").trim(),
      notes: (form.notes || "").trim(),
      rif: form.rif ? `${form.doc_prefix}-${form.rif}` : "",
    });
  };

  const onEnterSave = e => { if (e.key === "Enter") handleSave(); };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar contacto" : "Nuevo contacto"}
      width={520}
    >
      <div className="space-y-5">
        {/* Selector de Tipo Segmentado */}
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
              {isProveedor ? "Razón Social / Empresa" : "Nombre completo"} <span className="text-danger">*</span>
            </label>
            <input
              ref={nameRef}
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value.toUpperCase() }))}
              onKeyDown={onEnterSave}
              autoComplete="name"
              className={`input h-10 font-black tracking-tight ${isProveedor ? "focus:border-violet-500/50" : ""}`}
              placeholder={isProveedor ? "Ej: INVERSIONES GLOBALES C.A." : "Ej: JUAN PÉREZ"}
            />
          </div>

          {/* RIF / Documento */}
          <div>
            <label className="label mb-1.5 opacity-70">
              {isRif ? "RIF" : "Cédula de identidad"}
            </label>
            <div className="flex gap-2">
              <select
                value={form.doc_prefix}
                onChange={e => {
                  const newPrefix = e.target.value;
                  const newMax = RIF_PREFIXES.includes(newPrefix) ? 9 : 8;
                  setForm(p => ({ ...p, doc_prefix: newPrefix, rif: p.rif.slice(0, newMax) }));
                }}
                className="input h-10 w-20 font-black text-center cursor-pointer"
              >
                {DOC_PREFIXES.map(p => (
                  <option key={p} value={p}>{p}-</option>
                ))}
              </select>
              <input
                value={form.rif}
                onChange={e => setForm(p => ({ ...p, rif: e.target.value.replace(/\D/g, "") }))}
                onKeyDown={onEnterSave}
                maxLength={maxRifLen}
                inputMode="numeric"
                className="input h-10 font-bold tabular-nums flex-1"
                placeholder={"0".repeat(maxRifLen)}
              />
            </div>
          </div>

          {/* Teléfono */}
          <div>
            <label className="label mb-1.5 opacity-70">Teléfono</label>
            <input
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d\s+\-()]/g, "") }))}
              onKeyDown={onEnterSave}
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              className="input h-10 font-bold tabular-nums"
              placeholder="+58 412 0000000"
            />
          </div>

          {/* Correo */}
          <div className="col-span-2">
            <label className="label mb-1.5 opacity-70">Correo electrónico</label>
            <input
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase() }))}
              onKeyDown={onEnterSave}
              type="email"
              inputMode="email"
              autoComplete="email"
              className="input h-10 font-bold"
              placeholder="ejemplo@dominio.com"
            />
          </div>

          {/* Notas */}
          <div className="col-span-2">
            <label className="label mb-1.5 opacity-70">Observaciones internas</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
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
          onClick={handleSave}
          loading={loading}
          disabled={!canSave}
          className={`h-10 px-8 shadow-xl font-black tracking-[0.2em] text-[10px] uppercase ${isProveedor ? "bg-violet-600 hover:bg-violet-700 shadow-violet-600/20" : ""}`}
        >
          {isEdit ? "GUARDAR CAMBIOS" : "REGISTRAR CONTACTO"}
        </Button>
      </div>
    </Modal>
  );
}
