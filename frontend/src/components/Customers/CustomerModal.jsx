import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import { useApp } from "../../context/AppContext";

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
  credit_days: "",
};

export default function CustomerModal({ open, onClose, onSave, editData, loading }) {
  const [form, setForm] = useState(EMPTY);
  const { settings } = useApp();
  const generalDays = parseInt(settings?.customer_credit_days, 10) || 0;
  const generalLabel = generalDays > 0 ? `${generalDays} días` : "de contado";
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
          // 0 se conserva: es "de contado" a propósito, distinto de vacío (plazo general).
          credit_days: editData.credit_days === null || editData.credit_days === undefined ? "" : String(editData.credit_days),
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

  // Devuelve la promesa del guardado: con ella el botón se bloquea y muestra el spinner
  // hasta que el servidor responde (ver ui/Button).
  const handleSave = () => {
    if (!canSave) return;
    return onSave({
      ...form,
      name: (form.name || "").trim(),
      phone: (form.phone || "").trim(),
      email: (form.email || "").trim(),
      address: (form.address || "").trim(),
      notes: (form.notes || "").trim(),
      rif: form.rif ? `${form.doc_prefix}-${form.rif}` : "",
      credit_days: form.credit_days === "" ? null : parseInt(form.credit_days, 10),
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
        <div className="flex p-1 bg-surface-3 dark:bg-white/[0.06] rounded-lg">
          <button
            onClick={() => setForm(p => ({ ...p, type: "cliente" }))}
            className={`flex-1 h-8 text-[13px] font-semibold rounded-md transition-all ${!isProveedor
              ? "bg-white text-content shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-white"
              : "text-content-subtle hover:text-content dark:text-white/50 dark:hover:text-white"
              }`}
          >
            Cliente
          </button>
          <button
            onClick={() => setForm(p => ({ ...p, type: "proveedor" }))}
            className={`flex-1 h-8 text-[13px] font-semibold rounded-md transition-all ${isProveedor
              ? "bg-white text-content shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-white"
              : "text-content-subtle hover:text-content dark:text-white/50 dark:hover:text-white"
              }`}
          >
            Proveedor
          </button>
        </div>

        {/* Una sola columna en teléfono: documento y teléfono compartiendo fila dejaban al
            número del documento un tercio de la pantalla. Desde tablet vuelven a ir en dos. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nombre */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5">
              {isProveedor ? "Razón social o empresa" : "Nombre completo"} <span className="text-red-500">*</span>
            </label>
            <input
              ref={nameRef}
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value.toUpperCase() }))}
              onKeyDown={onEnterSave}
              autoComplete="name"
              className="input h-10"
              placeholder={isProveedor ? "Ej: INVERSIONES GLOBALES C.A." : "Ej: JUAN PÉREZ"}
            />
          </div>

          {/* RIF / Documento */}
          <div>
            <label className="label mb-1.5">
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
                boxClassName="w-[52px] !px-1.5 font-bold rounded-lg"
              />
              <input
                value={form.rif}
                onChange={e => setForm(p => ({ ...p, rif: e.target.value.replace(/\D/g, "") }))}
                onKeyDown={onEnterSave}
                maxLength={maxRifLen}
                inputMode="numeric"
                /* Misma letra que los demás campos: lo que tenía que crecer era la caja —el
                   ancho que le cede el prefijo—, no el número. */
                className="input h-10 flex-1 min-w-0 tabular-nums"
                placeholder={"0".repeat(maxRifLen)}
              />
            </div>
          </div>

          {/* Teléfono */}
          <div>
            <label className="label mb-1.5">Teléfono</label>
            <input
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d\s+\-()]/g, "") }))}
              onKeyDown={onEnterSave}
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              className="input h-10 tabular-nums"
              placeholder="+58 412 0000000"
            />
          </div>

          {/* Días de crédito: de aquí sale cuándo vence cada documento en Cuentas por Pagar
              (proveedor) o en Cuentas por Cobrar (cliente). */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5">Días de crédito</label>
            <input
              value={form.credit_days}
              onChange={e => setForm(p => ({ ...p, credit_days: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
              onKeyDown={onEnterSave}
              inputMode="numeric"
              className="input h-10 tabular-nums"
              // Al cliente vacío le aplica el plazo general: se muestra cuál es, para que no
              // haga falta ir a Configuración a averiguarlo.
              placeholder={isProveedor ? "0 = de contado" : `Vacío = plazo general (${generalLabel})`}
            />
            <p className="text-[11px] font-medium text-content-subtle dark:text-white/35 mt-1">
              {isProveedor
                ? "Cada compra a este proveedor vencerá esta cantidad de días después de su fecha."
                : "Déjalo vacío para usar el plazo general de la empresa. Escribe un número solo si este cliente es una excepción: más días, menos, o 0 para no darle crédito."}
            </p>
          </div>

          {/* Correo */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5">Correo electrónico</label>
            <input
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase() }))}
              onKeyDown={onEnterSave}
              type="email"
              inputMode="email"
              autoComplete="email"
              className="input h-10"
              placeholder="ejemplo@dominio.com"
            />
          </div>

          {/* Dirección */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5">Dirección</label>
            <input
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              onKeyDown={onEnterSave}
              autoComplete="street-address"
              className="input h-10"
              placeholder="Av. Principal, Casa / Local #..."
            />
          </div>

          {/* Notas */}
          <div className="sm:col-span-2">
            <label className="label mb-1.5">Observaciones internas</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="input min-h-[80px] py-3 resize-none text-[12px] font-medium leading-relaxed"
              placeholder="Detalles adicionales sobre este contacto..."
            />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 -mx-6 -mb-6 mt-6 px-6 py-4 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] rounded-b-xl">
        <Button
          variant="ghost"
          onClick={onClose}
          className="px-4"
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          loading={loading}
          disabled={!canSave}
          className="px-5"
        >
          {isEdit ? "Guardar cambios" : "Registrar contacto"}
        </Button>
      </div>
    </Modal>
  );
}
