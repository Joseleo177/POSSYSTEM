import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";

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
          // El nombre puede venir de un alta rápida hecha desde el buscador del POS, donde
          // nadie tecleó en este campo y el toUpperCase del onChange nunca corrió.
          name: (editData.name || "").toUpperCase(),
          doc_prefix: match ? match[1] : "V",
          rif: match ? match[2] : fullRif,
        });
      } else {
        // En alta también aceptamos un documento prellenado (ej. desde el buscador de
        // cobro, cuando lo tecleado es solo numérico y se interpreta como cédula/RIF).
        const preRif = editData?.rif || "";
        const preMatch = preRif.match(/^([VEJGP])-(.*)$/);
        setForm({
          ...EMPTY,
          type: editData?._newType || "cliente",
          name: (editData?._newName || editData?.name || "").toUpperCase(),
          doc_prefix: preMatch ? preMatch[1] : "V",
          rif: preMatch ? preMatch[2] : preRif,
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

        {/* Una sola columna en teléfono: documento y teléfono compartiendo fila dejaban al
            número del documento un tercio de la pantalla. Desde tablet vuelven a ir en dos. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nombre */}
          <div className="sm:col-span-2">
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
              {/* El prefijo es una sola letra: la caja se queda en lo justo para mostrarla y
                  todo el ancho restante va al número, que son 7 u 8 dígitos y es lo que de
                  verdad se teclea. En un teléfono esa diferencia es la que decide si el
                  documento se lee entero o recortado.
                  El desplegable se abre más ancho que la caja (menuMinWidth), porque con 52 px
                  las opciones no tendrían sitio ni para su propio padding. */}
              <CustomSelect
                value={form.doc_prefix}
                onChange={val => {
                  const newMax = RIF_PREFIXES.includes(val) ? 9 : 8;
                  setForm(p => ({ ...p, doc_prefix: val, rif: p.rif.slice(0, newMax) }));
                }}
                options={DOC_PREFIXES.map(p => ({ value: p, label: `${p}-` }))}
                height="h-10"
                menuMinWidth={104}
                className="shrink-0"
                /* El `!` es necesario: la caja trae px-3 de serie y, entre dos utilidades de
                   padding, gana la que Tailwind emite última, no la que se pase aquí. */
                boxClassName="w-[52px] !px-1.5 font-black rounded-lg"
              />
              <input
                value={form.rif}
                onChange={e => setForm(p => ({ ...p, rif: e.target.value.replace(/\D/g, "") }))}
                onKeyDown={onEnterSave}
                maxLength={maxRifLen}
                inputMode="numeric"
                /* Misma letra que los demás campos: lo que tenía que crecer era la caja —el
                   ancho que le cede el prefijo—, no el número. */
                className="input h-10 flex-1 min-w-0 font-bold tabular-nums"
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
          <div className="sm:col-span-2">
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

          {/* Dirección */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5 opacity-70">Dirección</label>
            <input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              onKeyDown={onEnterSave}
              autoComplete="street-address"
              className="input h-10 font-bold"
              placeholder="Av. Principal, Casa / Local #..."
            />
          </div>

          {/* Notas */}
          <div className="sm:col-span-2">
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
