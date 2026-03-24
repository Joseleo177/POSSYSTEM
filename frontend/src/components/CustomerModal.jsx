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
    ? `EDITAR ${typeLabel.toUpperCase()}`
    : `REGISTRAR ${typeLabel.toUpperCase()}`;

  const handleSubmit = () => {
    if (!form.name.trim()) return alert("El nombre es requerido");
    if (!form.rif.trim())  return alert("La cédula / RIF es requerida");
    onSave(form);
  };

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} width={640}>

      {/* ── Toggle tipo (Switch Card Premium) ── */}
      <div className="bg-surface-2 dark:bg-white/5 p-6 rounded-[32px] flex items-center justify-between border border-border/60 dark:border-white/5 mb-10 transition-all hover:bg-surface-2 dark:hover:bg-white/10 group shadow-sm">
        <div className="flex-1 pr-8">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-sm border border-white/50 dark:border-white/5 ${
              isProveedor ? "bg-violet-500/10 text-violet-500" : "bg-brand-500/10 text-brand-500"
            }`}>
              {isProveedor ? "P" : "C"}
            </div>
            <h4 className="text-sm font-black tracking-[2px] text-content dark:text-content-dark uppercase font-display">
              {isProveedor ? "Modo Proveedor" : "Modo Cliente"}
            </h4>
          </div>
          <p className="text-[11px] text-content-subtle dark:text-content-dark-muted font-bold leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
            {isProveedor 
              ? "Registro de proveedores para compras y control de stock."
              : "Gestión de clientes, ventas y seguimiento de créditos."}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer scale-110">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={isProveedor}
            onChange={() => setForm(p => ({ ...p, type: p.type === 'cliente' ? 'proveedor' : 'cliente' }))}
          />
          <div className={`w-16 h-9 bg-surface-3 dark:bg-white/10 rounded-full border-2 border-transparent transition-all duration-500
            peer-checked:bg-violet-600 peer-focus:ring-8 peer-focus:ring-violet-500/10
            after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-7 after:w-7 after:transition-all after:shadow-lg
            peer-checked:after:translate-x-7`}>
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {/* Full row: Nombre */}
        <div className="md:col-span-2">
          <label className="label !text-[10px] !tracking-[3px] opacity-60">
            {isProveedor ? "Nombre Legal o Razón Social" : "Nombre Completo / Razón Social"}
          </label>
          <input 
            value={form.name} 
            onChange={set("name")} 
            type="text" 
            className="input !h-14 !text-base !rounded-2xl" 
            placeholder={isProveedor ? "Ej: Distribuidora Central C.A." : "Ej: Juan Pérez"}
            autoFocus 
          />
        </div>

        {/* Teléfono y Correo */}
        <div>
          <label className="label !text-[10px] !tracking-[3px] opacity-60">Teléfono Móvil</label>
          <input value={form.phone} onChange={set("phone")} type="text" className="input !h-12 !rounded-xl" placeholder="Ej: 0412-0000000" />
        </div>
        <div>
          <label className="label !text-[10px] !tracking-[3px] opacity-60">Correo Electrónico</label>
          <input value={form.email} onChange={set("email")} type="email" className="input !h-12 !rounded-xl" placeholder="ejemplo@correo.com" />
        </div>

        {/* Cédula/RIF y Razón Social Extra */}
        <div>
          <label className="label !text-[10px] !tracking-[3px] opacity-60">{isProveedor ? "R.I.F del Proveedor" : "Cédula / Documento"}</label>
          <input
            value={form.rif} 
            onChange={(e) => {
              const val = e.target.value.replace(/[^\dJKGVEjkgve]/g, "").toUpperCase();
              setForm(p => ({ ...p, rif: val }));
            }} 
            type="text"
            placeholder="Ej: V12345678"
            className="input !h-12 !rounded-xl"
          />
        </div>

        {isProveedor ? (
          <div>
            <label className="label !text-[10px] !tracking-[3px] opacity-60">Alias Comercial</label>
            <input value={form.tax_name} onChange={set("tax_name")} type="text" className="input !h-12 !rounded-xl" placeholder="Nombre corto" />
          </div>
        ) : (
          <div>
            <label className="label !text-[10px] !tracking-[3px] opacity-60">Ubicación / Ciudad</label>
            <input value={form.address} onChange={set("address")} type="text" className="input !h-12 !rounded-xl" placeholder="Sector, Ciudad" />
          </div>
        )}

        {/* Full row: Notas */}
        <div className="md:col-span-2">
          <label className="label !text-[10px] !tracking-[3px] opacity-60">Observaciones Internas</label>
          <textarea
            value={form.notes} onChange={set("notes")} rows={3}
            className="input resize-none !rounded-2xl py-4"
            placeholder="Información adicional relevante..."
          />
        </div>
      </div>

      {/* ── Botones de Acción ── */}
      <div className="flex gap-4 justify-end mt-12 pt-8 border-t border-border/40">
        <button onClick={onClose} className="btn-secondary !border-none !shadow-none hover:!bg-surface-2 !text-content-subtle font-black uppercase tracking-[2px] !text-[11px] px-8">
          Cancelar
        </button>
        <button
          onClick={handleSubmit} disabled={loading}
          className={[
            "btn-primary h-14 min-w-[200px] !rounded-2xl font-black text-white uppercase tracking-[3px] !text-[11px] shadow-xl",
            loading ? "opacity-60 cursor-not-allowed bg-surface-dark-3" : (isProveedor ? "!bg-violet-600 hover:!bg-violet-700 shadow-violet-600/20" : "")
          ].join(" ")}
        >
          {loading ? "PROCESANDO..." : isEdit ? "GUARDAR CAMBIOS" : `REGISTRAR ${typeLabel.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  );
}
