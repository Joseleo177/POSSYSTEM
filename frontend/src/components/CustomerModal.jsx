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
        setForm({ ...EMPTY, type: editData?._newType || "cliente", name: editData?._newName || "" });
      }
    }
  }, [open, editData]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const isEdit = !!editData;
  const isProveedor = form.type === "proveedor";
  const typeLabel   = isProveedor ? "Proveedor" : "Cliente";
  const modalTitle  = isEdit ? `EDITAR ${typeLabel.toUpperCase()}` : `REGISTRAR ${typeLabel.toUpperCase()}`;

  const handleSubmit = () => {
    if (!form.name.trim()) return alert("El nombre es requerido");
    if (!form.rif.trim())  return alert("La cédula / RIF es requerida");
    onSave(form);
  };

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} width={580}>

      {/* ── Toggle tipo ── */}
      <div className="bg-surface-2 dark:bg-white/5 px-4 py-3 rounded-xl flex items-center justify-between border border-border/50 dark:border-white/5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
            isProveedor ? "bg-violet-500/10 text-violet-500" : "bg-brand-500/10 text-brand-500"
          }`}>
            {isProveedor ? "P" : "C"}
          </div>
          <div>
            <div className="text-xs font-black text-content dark:text-content-dark uppercase tracking-wide">
              {isProveedor ? "Modo Proveedor" : "Modo Cliente"}
            </div>
            <div className="text-[10px] text-content-subtle dark:text-content-dark-muted opacity-70">
              {isProveedor ? "Registro de proveedores para compras." : "Gestión de clientes y créditos."}
            </div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={isProveedor}
            onChange={() => setForm(p => ({ ...p, type: p.type === "cliente" ? "proveedor" : "cliente" }))}
          />
          <div className={`w-11 h-6 bg-surface-3 dark:bg-white/10 rounded-full border-2 border-transparent transition-all duration-300
            peer-checked:bg-violet-600
            after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all after:shadow
            peer-checked:after:translate-x-5`}>
          </div>
        </label>
      </div>

      {/* ── Campos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div className="md:col-span-2">
          <label className="label">{isProveedor ? "Nombre Legal o Razón Social" : "Nombre Completo / Razón Social"}</label>
          <input
            value={form.name}
            onChange={set("name")}
            type="text"
            className="input"
            placeholder={isProveedor ? "Ej: Distribuidora Central C.A." : "Ej: Juan Pérez"}
            autoFocus
          />
        </div>

        <div>
          <label className="label">Teléfono Móvil</label>
          <input value={form.phone} onChange={set("phone")} type="text" className="input" placeholder="Ej: 0412-0000000" />
        </div>
        <div>
          <label className="label">Correo Electrónico</label>
          <input value={form.email} onChange={set("email")} type="email" className="input" placeholder="ejemplo@correo.com" />
        </div>

        <div>
          <label className="label">{isProveedor ? "R.I.F del Proveedor" : "Cédula / Documento"}</label>
          <input
            value={form.rif}
            onChange={(e) => {
              const val = e.target.value.replace(/[^\dJKGVEjkgve]/g, "").toUpperCase();
              setForm(p => ({ ...p, rif: val }));
            }}
            type="text"
            placeholder="Ej: V12345678"
            className="input"
          />
        </div>

        {isProveedor ? (
          <div>
            <label className="label">Alias Comercial</label>
            <input value={form.tax_name} onChange={set("tax_name")} type="text" className="input" placeholder="Nombre corto" />
          </div>
        ) : (
          <div>
            <label className="label">Ubicación / Ciudad</label>
            <input value={form.address} onChange={set("address")} type="text" className="input" placeholder="Sector, Ciudad" />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="label">Observaciones Internas</label>
          <textarea
            value={form.notes} onChange={set("notes")} rows={2}
            className="input resize-none"
            placeholder="Información adicional relevante..."
          />
        </div>
      </div>

      {/* ── Botones ── */}
      <div className="flex gap-3 justify-end mt-4 pt-3 border-t border-border/40 dark:border-border-dark/40">
        <button onClick={onClose} className="btn-sm btn-secondary">
          Cancelar
        </button>
        <button
          onClick={handleSubmit} disabled={loading}
          className={[
            "btn-sm btn-primary min-w-[140px]",
            loading ? "opacity-60 cursor-not-allowed" : (isProveedor ? "!bg-violet-600 hover:!bg-violet-700" : "")
          ].join(" ")}
        >
          {loading ? "Procesando..." : isEdit ? "Guardar Cambios" : `Registrar ${typeLabel}`}
        </button>
      </div>
    </Modal>
  );
}
