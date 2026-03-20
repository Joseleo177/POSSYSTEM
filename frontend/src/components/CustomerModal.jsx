import { useState, useEffect } from "react";
import Modal from "./Modal";

const EMPTY = {
  type: "cliente",
  name: "", phone: "", email: "", address: "",
  rif: "", tax_name: "", notes: "",
};

export default function CustomerModal({ open, onClose, onSave, editData, loading }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      if (editData?.id) {
        // Editing existing record
        setForm({
          type:     editData.type     || "cliente",
          name:     editData.name     || "",
          phone:    editData.phone    || "",
          email:    editData.email    || "",
          address:  editData.address  || "",
          rif:      editData.rif      || "",
          tax_name: editData.tax_name || "",
          notes:    editData.notes    || "",
        });
      } else {
        // New record — pre-set type and optional name if provided
        setForm({ ...EMPTY, type: editData?._newType || "cliente", name: editData?._newName || "" });
      }
    }
  }, [open, editData]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const isEdit = !!editData;
  const isProveedor = form.type === "proveedor";

  const typeLabel   = isProveedor ? "Proveedor" : "Cliente";
  const modalTitle  = isEdit
    ? `✏ EDITAR ${typeLabel.toUpperCase()}`
    : `+ REGISTRAR ${typeLabel.toUpperCase()}`;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} width={600}>

      {/* ── Toggle tipo ── */}
      <div className="flex gap-0 mb-[18px] bg-surface-dark dark:bg-surface-dark rounded p-[3px] w-fit">
        {[["cliente", "👤 Cliente"], ["proveedor", "🏭 Proveedor"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setForm(p => ({ ...p, type: val }))}
            className={[
              "px-5 py-1.5 rounded-sm text-xs font-bold cursor-pointer transition-all duration-150 border-none font-sans",
              form.type === val
                ? val === "cliente"
                  ? "bg-info text-white"
                  : "bg-violet-600 text-white"
                : "bg-transparent text-content-muted dark:text-content-dark-muted",
            ].join(" ")}
          >{label}</button>
        ))}
      </div>

      {/* ── Datos de contacto ── */}
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-[10px] mb-[10px]">
        <div>
          <label className="label">
            {isProveedor ? "Nombre o empresa *" : "Nombre *"}
          </label>
          <input value={form.name} onChange={set("name")} type="text" className="input" autoFocus />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input value={form.phone} onChange={set("phone")} type="text" className="input" />
        </div>
        <div>
          <label className="label">Correo</label>
          <input value={form.email} onChange={set("email")} type="email" className="input" />
        </div>
      </div>

      {/* ── Dirección ── */}
      <div className="mb-[10px]">
        <label className="label">Dirección</label>
        <input value={form.address} onChange={set("address")} type="text" className="input" />
      </div>

      {/* ── Datos fiscales ── */}
      <div className={`grid gap-[10px] mb-[10px] ${isProveedor ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <label className="label">RIF / Cédula</label>
          <input
            value={form.rif} onChange={set("rif")} type="text"
            placeholder={isProveedor ? "J-12345678-9" : "V-12345678"}
            className="input"
          />
        </div>

        {isProveedor && (
          <div>
            <label className="label">Razón social</label>
            <input value={form.tax_name} onChange={set("tax_name")} type="text" className="input" />
          </div>
        )}
      </div>

      {/* ── Notas ── */}
      <div className="mb-5">
        <label className="label">Notas</label>
        <textarea
          value={form.notes} onChange={set("notes")} rows={2}
          className="input resize-y min-h-[52px]"
        />
      </div>

      {/* ── Botones ── */}
      <div className="flex gap-[10px] justify-end">
        <button onClick={onClose} className="btn-sm btn-secondary">Cancelar</button>
        <button
          onClick={() => onSave(form)} disabled={loading}
          className={[
            "btn-md font-bold text-white border-none rounded",
            loading
              ? "opacity-60 cursor-not-allowed bg-surface-dark-3 dark:bg-surface-dark-3"
              : isProveedor
                ? "bg-violet-600 hover:bg-violet-700 cursor-pointer"
                : "bg-info hover:bg-blue-600 cursor-pointer",
          ].join(" ")}
        >
          {loading ? "Guardando..." : isEdit ? "Guardar" : `Registrar ${typeLabel}`}
        </button>
      </div>
    </Modal>
  );
}
