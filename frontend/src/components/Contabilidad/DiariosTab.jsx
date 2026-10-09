import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import Segmented from "../ui/Segmented";
import DatePicker from "../ui/DatePicker";
import StatusMark, { ACTIVE_STATUS } from "../ui/StatusMark";
import { ledgerRow, stopRow, LedgerEmpty, RowIcon } from "../ui/Ledger";
import { toNameCase } from "../../helpers";

// El diario es la CUENTA (o la gaveta de efectivo) y acepta varios métodos, cada uno con su
// sentido: el Banco de Venezuela cobra por pago móvil, punto y biopago, y paga solo por pago
// móvil. Ver migración journal-accounts y utils/journalMethod.js.
const EMPTY_JOURNAL = {
  name: "", color: "#6366f1", active: true, bank_id: null, currency_id: null, warehouse_ids: [],
  methods: [], account_number: "", opening_balance: "", opening_date: "",
};

// Sentido de un método dentro de la cuenta, en una sola opción para el usuario.
const SENTIDOS = [
  { key: "ambos",  label: "Recibe y paga", in: true,  out: true  },
  { key: "recibe", label: "Solo recibe",   in: true,  out: false },
  { key: "paga",   label: "Solo paga",     in: false, out: true  },
];
const sentidoKey = (m) => m.allows_inflow === false ? "paga" : m.allows_outflow === false ? "recibe" : "ambos";
const SENTIDO_CORTO = { recibe: "solo recibe", paga: "solo paga" };

// Colores sugeridos para los diarios: distinguibles entre sí y legibles como punto en claro y
// en oscuro. Se puede elegir cualquier otro desde el último botón.
const PALETA = ["#6366f1", "#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#475569"];

const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Rótulo arriba, "Opcional" a la derecha y una ayuda debajo si hace falta.
function Campo({ label, hint, ayuda, children }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-content-subtle">{label}</span>
        {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
      </p>
      {children}
      {ayuda && <p className="mt-1.5 text-[12px] text-content-subtle leading-relaxed">{ayuda}</p>}
    </div>
  );
}

export default function DiariosTab({ notify, can, journals, loadJournals, activeMethods, methodByCode, activeBanks, currencies, warehouses = [] }) {
  const [newJournal, setNewJournal] = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const closeModal = () => { setShowModal(false); setEditJournal(null); setNewJournal(EMPTY_JOURNAL); };

  // Diarios que comparten método + banco + moneda + el MISMO juego de sucursales: son la
  // misma caja repetida. El backend ya no deja crear nuevos; esto marca los viejos.
  const dupKey = (j) => `${j.bank_id ? "" : (j.type || "")}|${j.bank_id || ""}|${j.currency_id || ""}|${[...(j.warehouse_ids || [])].sort((a, b) => a - b).join(",")}|${String(j.account_number || "").replace(/\D/g, "")}`;
  const dupIds = (() => {
    const byKey = {};
    (journals || []).forEach(j => {
      const k = dupKey(j);
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(j.id);
    });
    return new Set(Object.values(byKey).filter(ids => ids.length > 1).flat());
  })();

  // form y setter unificados para el modal
  const form = editJournal ?? newJournal;
  const setForm = (updater) => editJournal ? setEditJournal(updater) : setNewJournal(updater);

  const submitJournal = async () => {
    if (!form.name.trim()) return notify("El nombre es requerido", "err");
    if (!(form.methods || []).length) return notify("Agrega al menos un método de pago", "err");
    // Sin selector de sucursales visible (un solo local, sin permiso admin) no se manda el
    // campo: el backend conserva lo que el diario ya tenía y, al crear, usa el local propio.
    const puedeElegirSedes = warehouses.length > 1 || can("admin");
    const clean = (obj) => {
      const c = { ...obj };
      if (!puedeElegirSedes) delete c.warehouse_ids;
      delete c.warehouse_id; delete c.warehouse_name; delete c.warehouse_names;
      // El método principal es el primero de la lista.
      c.type = c.methods[0]?.method_code || null;
      return c;
    };
    try {
      if (editJournal) {
        await api.journals.update(editJournal.id, clean(editJournal));
        notify("Diario actualizado");
      } else {
        await api.journals.create(clean(newJournal));
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

  const canManage = can("journals.manage");
  const abrirNuevo  = () => { setEditJournal(null); setNewJournal(EMPTY_JOURNAL); setShowModal(true); };
  const abrirEditar = (j) => {
    setEditJournal({
      ...j,
      warehouse_ids: [...(j.warehouse_ids || [])],
      methods: (j.methods || []).map(m => ({ ...m })),
      account_number: j.account_number || "",
      opening_balance: j.opening_balance ? String(j.opening_balance) : "",
      opening_date: j.opening_date || "",
    });
    setShowModal(true);
  };

  // Textos de la fila, en caja de oración: los nombres venían en mayúsculas y competían.
  // Métodos de la cuenta con su restricción, si la tienen: "Pago móvil · Punto (solo recibe)".
  const metodoDe   = (j) => (j.methods?.length ? j.methods : (j.type ? [{ method_code: j.type }] : []))
    .map(m => {
      const n = methodByCode[m.method_code]?.name || m.method_code;
      const r = SENTIDO_CORTO[sentidoKey(m)];
      return r ? `${n} (${r})` : n;
    }).join(" · ") || "Sin método";
  const cuentaDe   = (j) => j.account_number ? `Cuenta ·· ${String(j.account_number).replace(/\D/g, "").slice(-4)}` : null;
  const sucursalDe = (j) => (j.warehouse_ids?.length ?? 0) === 0
    ? "Todas las sucursales"
    : j.warehouse_ids.length === 1
      ? toNameCase(j.warehouse_names?.[0] || j.warehouse_name)
      : `${j.warehouse_ids.length} sucursales`;
  const monedaDe   = (j) => j.currency_code ? `${j.currency_symbol} ${j.currency_code}` : "Moneda base";
  const DUP_TONE   = "#ef4444";

  // Acciones siempre a la vista: en una tablet no hay hover que las descubra.
  const acciones = (j) => canManage ? (
    <div className="flex items-center justify-end gap-0.5" onClick={stopRow}>
      <RowIcon icon="edit" title="Editar diario" onClick={() => abrirEditar(j)} />
      <RowIcon icon="power" title={j.active ? "Desactivar" : "Activar"} onClick={() => toggleJournal(j)} />
      <RowIcon icon="trash" tone="danger" title="Eliminar diario" onClick={() => setDeleteConfirm(j)} />
    </div>
  ) : null;

  const nombre = (j) => (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-transparent shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: j.color }} />
      <div className="min-w-0">
        <div className={`text-[13px] font-semibold truncate ${j.active ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(j.name)}</div>
        {dupIds.has(j.id) && (
          <div className="text-[12px] font-medium text-red-600 dark:text-red-400 truncate" title="Otro diario tiene el mismo método, banco, moneda y sucursales. Desactívalo o elimínalo.">
            Duplicado de otra caja
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
        <span className="text-[13px] text-content-subtle">
          {journals.length} diario{journals.length !== 1 ? "s" : ""}
        </span>
        {canManage && <Button onClick={abrirNuevo}>+ Nuevo diario</Button>}
      </div>

      {/* ── Libro (escritorio) ── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="table-ledger min-w-[820px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="pl-4">Diario</th>
              <th>Método y banco</th>
              <th>Sucursal</th>
              <th>Moneda</th>
              <th>Estado</th>
              <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {journals.length === 0 ? (
              <LedgerEmpty cols={6} title="Sin diarios" hint="Cada caja o cuenta bancaria por la que entra o sale dinero es un diario." />
            ) : journals.map(j => (
              <tr key={j.id} {...ledgerRow(canManage ? () => abrirEditar(j) : undefined, dupIds.has(j.id) ? DUP_TONE : undefined)}>
                <td className="pl-4 max-w-0 w-[26%]">{nombre(j)}</td>
                <td className="max-w-0">
                  <div className="text-[13px] text-content dark:text-white truncate" title={metodoDe(j)}>{metodoDe(j)}</div>
                  <div className="text-[12px] text-content-subtle truncate">
                    {[toNameCase(j.bank_name || j.bank) || "Sin banco", cuentaDe(j)].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td>
                  <span className="text-[13px] text-content-subtle whitespace-nowrap" title={(j.warehouse_names || []).join(", ") || undefined}>{sucursalDe(j)}</span>
                </td>
                <td><span className="text-[13px] text-content dark:text-white tabular-nums whitespace-nowrap">{monedaDe(j)}</span></td>
                <td><StatusMark status={j.active ? "activo" : "inactivo"} map={ACTIVE_STATUS} /></td>
                <td className="pr-4 whitespace-nowrap cursor-default">{acciones(j)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tarjetas (teléfono) ── */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {journals.length === 0 ? (
          <div className="py-16 text-center px-6">
            <div className="text-[14px] font-semibold text-content dark:text-white">Sin diarios</div>
            <div className="text-[13px] text-content-subtle mt-1">Cada caja o cuenta bancaria por la que entra o sale dinero es un diario.</div>
          </div>
        ) : journals.map(j => (
          <div key={j.id}
            style={dupIds.has(j.id) ? { boxShadow: `inset 3px 0 0 ${DUP_TONE}` } : undefined}
            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-1.5 py-3">
            <div className="flex items-center justify-between gap-2">
              {nombre(j)}
              {acciones(j)}
            </div>
            <div className="mt-1.5 pl-5 text-[12px] text-content-subtle truncate">
              {[metodoDe(j), cuentaDe(j), monedaDe(j), sucursalDe(j)].filter(Boolean).join(" · ")}
            </div>
            {!j.active && <div className="mt-1 pl-5"><StatusMark status="inactivo" map={ACTIVE_STATUS} /></div>}
          </div>
        ))}
      </div>

      {/* Modal: crear / editar */}
      {(() => {
        const sedes = warehouses.filter(w => w.sells !== false);
        const marcadas = form.warehouse_ids || [];
        const toggleSede = (id) => setForm(p => {
          const cur = p.warehouse_ids || [];
          return { ...p, warehouse_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
        });
        const metodo = metodoDe(form);
        const usados = new Set((form.methods || []).map(m => m.method_code));
        const disponibles = activeMethods.filter(m => !usados.has(m.code));
        const setMetodo = (idx, patch) => setForm(p => {
          const ms = [...(p.methods || [])];
          ms[idx] = { ...ms[idx], ...patch };
          return { ...p, methods: ms };
        });
        // Al agregar un método se sugiere su sentido habitual (un punto de venta solo cobra);
        // se cambia aquí mismo. El primero de la lista es el principal.
        const agregarMetodo = (code) => {
          if (!code) return;
          const m = activeMethods.find(x => x.code === code);
          setForm(p => ({ ...p, methods: [...(p.methods || []), { method_code: code, allows_inflow: true, allows_outflow: m?.allows_outflow !== false }] }));
        };
        const esEfectivo = !form.bank_id && (form.methods || []).every(m => m.method_code === "efectivo");
        const moneda = currencies.find(c => String(c.id) === String(form.currency_id));
        const sucursalTxt = marcadas.length === 0
          ? "Todas las sucursales"
          : marcadas.length === 1
            ? toNameCase(sedes.find(w => w.id === marcadas[0])?.name || "1 sucursal")
            : `${marcadas.length} sucursales`;
        const enPaleta = PALETA.includes(String(form.color || "").toLowerCase());
        const chip = (on) => `h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors ${on
          ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
          : "border-border dark:border-white/15 text-content-muted dark:text-white/70 hover:border-content-subtle/60"}`;

        return (
          <Modal
            open={showModal || !!editJournal}
            onClose={closeModal}
            title={editJournal ? "Editar diario" : "Nuevo diario"}
            width={480}
            footer={
              <div className="flex gap-2 sm:justify-end">
                <button type="button" onClick={closeModal} className="btn-outline h-11 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                <Button variant="primary" onClick={submitJournal} className="flex-1 sm:flex-none sm:min-w-[150px] h-11 sm:h-10">
                  {editJournal ? "Guardar cambios" : "Crear diario"}
                </Button>
              </div>
            }
          >
            <div className="space-y-5">
              {/* Vista previa: así se verá en la lista de diarios y en los cobros. */}
              <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0 ring-4 ring-white dark:ring-white/10" style={{ background: form.color || "#94a3b8" }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(form.name) || "Nombre del diario"}</p>
                  <p className="text-[12px] text-content-subtle truncate">
                    {[metodo, moneda ? `${moneda.symbol} ${moneda.code}` : "Moneda base", sucursalTxt].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              <Campo label="Nombre" ayuda="Como lo va a reconocer el cajero: «Banco de Venezuela», «Efectivo Bs Centro».">
                <input
                  data-autofocus
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej. Caja principal $"
                  className={INPUT}
                />
              </Campo>

              <Campo label="Banco o entidad" hint="Opcional">
                <CustomSelect
                  value={form.bank_id ? String(form.bank_id) : ""}
                  onChange={v => setForm(p => ({ ...p, bank_id: v || null }))}
                  options={[
                    { value: "", label: "Sin banco (efectivo)" },
                    ...activeBanks.map(b => ({ value: String(b.id), label: toNameCase(b.name) })),
                  ]}
                  className="w-full"
                />
              </Campo>

              {/* Métodos que acepta la cuenta, cada uno con su sentido. El sentido decide en
                  qué selectores aparece: para cobrar solo los que reciben; para egresos,
                  proveedores y vuelto, solo los que pagan. */}
              <Campo label="Métodos de pago"
                ayuda="Por dónde entra o sale el dinero de esta cuenta. El primero es el principal.">
                <div className="space-y-2">
                  {(form.methods || []).map((m, idx) => (
                    <div key={m.method_code} className="rounded-lg border border-border/70 dark:border-white/10 pl-3 pr-1.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-content dark:text-white min-w-0 truncate">
                          {methodByCode[m.method_code]?.name || m.method_code}
                          {idx === 0 && <span className="ml-1.5 text-[12px] font-normal text-content-subtle">principal</span>}
                        </span>
                        <button type="button" onClick={() => setForm(p => ({ ...p, methods: p.methods.filter((_, i) => i !== idx) }))}
                          title="Quitar método" aria-label="Quitar método"
                          className="w-8 h-8 shrink-0 rounded-lg text-content-subtle hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 transition-colors flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <Segmented
                        value={sentidoKey(m)}
                        onChange={k => { const x = SENTIDOS.find(y => y.key === k); setMetodo(idx, { allows_inflow: x.in, allows_outflow: x.out }); }}
                        options={SENTIDOS.map(x => ({ key: x.key, label: x.label }))}
                        className="mt-1.5 mr-1.5 w-[calc(100%-0.375rem)] [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2"
                      />
                    </div>
                  ))}
                  {disponibles.length > 0 && (
                    <CustomSelect
                      value=""
                      onChange={agregarMetodo}
                      placeholder="+ Agregar método"
                      options={disponibles.map(m => ({ value: m.code, label: m.name }))}
                      boxClassName="border-dashed"
                      className="w-full"
                    />
                  )}
                </div>
              </Campo>

              {!esEfectivo && (
                <Campo label="Número de cuenta" hint="Opcional"
                  ayuda="Distingue dos cuentas del mismo banco y moneda. Con él se reconoce el extracto en Conciliación.">
                  <input
                    value={form.account_number || ""}
                    onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))}
                    inputMode="numeric" autoComplete="off" placeholder="0102 0000 00 0000000000"
                    className={`${INPUT} tabular-nums`}
                  />
                </Campo>
              )}

              <Campo label="Moneda" ayuda="En la que se cuenta el dinero de esta caja. Los montos se convierten a la tasa del día.">
                <CustomSelect
                  value={form.currency_id ? String(form.currency_id) : ""}
                  onChange={v => setForm(p => ({ ...p, currency_id: v || null }))}
                  options={[
                    { value: "", label: "Moneda base" },
                    ...currencies.map(c => ({ value: String(c.id), label: `${c.symbol} ${c.code}` })),
                  ]}
                  className="w-full sm:max-w-[240px]"
                />
              </Campo>

              {/* Lo que tenía la cuenta el día que empezó a llevarse aquí: el estado de cuenta
                  arranca desde ahí en vez de desde cero. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Saldo inicial" hint="Opcional">
                  <input
                    value={form.opening_balance ?? ""}
                    onChange={e => setForm(p => ({ ...p, opening_balance: e.target.value.replace(/[^\d.,-]/g, "") }))}
                    inputMode="decimal" autoComplete="off" placeholder="0.00"
                    className={`${INPUT} text-right tabular-nums`}
                  />
                </Campo>
                <Campo label="Desde el día" hint="Opcional">
                  <DatePicker value={form.opening_date || ""} onChange={v => setForm(p => ({ ...p, opening_date: v || "" }))} />
                </Campo>
              </div>

              {/* Sucursales que atienden esta caja. Ninguna marcada = todas (compartido), lo
                  correcto para una cuenta bancaria de la empresa. Un depósito no cobra, así que
                  no se ofrece. Solo se pregunta si hay más de una sucursal. */}
              {(warehouses.length > 1 || can("admin")) && (
                <Campo label="Dónde se usa"
                  ayuda={marcadas.length === 0
                    ? "Aparece y suma en todas las sucursales: lo normal para una cuenta bancaria."
                    : `Solo aparece y suma en ${marcadas.length === 1 ? "esa sucursal" : `esas ${marcadas.length} sucursales`}.`}>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setForm(p => ({ ...p, warehouse_ids: [] }))} className={chip(marcadas.length === 0)} aria-pressed={marcadas.length === 0}>
                      Todas
                    </button>
                    {sedes.map(w => (
                      <button key={w.id} type="button" onClick={() => toggleSede(w.id)} className={chip(marcadas.includes(w.id))} aria-pressed={marcadas.includes(w.id)}>
                        {toNameCase(w.name)}
                      </button>
                    ))}
                  </div>
                </Campo>
              )}

              {/* Color: una paleta en vez del selector nativo (que se dibujaba como una barra a
                  todo el ancho). El último botón abre el selector libre. */}
              <Campo label="Color" ayuda="Lo distingue en la lista, en los cobros y en los reportes.">
                <div className="flex flex-wrap items-center gap-2">
                  {PALETA.map(c => {
                    const on = String(form.color || "").toLowerCase() === c;
                    return (
                      <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                        aria-label={`Color ${c}`} aria-pressed={on}
                        className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${on ? "ring-2 ring-offset-2 ring-content dark:ring-white dark:ring-offset-surface-dark-2" : "hover:scale-110"}`}
                        style={{ background: c }} />
                    );
                  })}
                  <label title="Otro color"
                    className={`relative w-8 h-8 rounded-full cursor-pointer flex items-center justify-center border border-dashed border-border dark:border-white/20 text-content-subtle hover:text-content dark:hover:text-white ${!enPaleta && form.color ? "ring-2 ring-offset-2 ring-content dark:ring-white dark:ring-offset-surface-dark-2 border-transparent" : ""}`}
                    style={!enPaleta && form.color ? { background: form.color } : undefined}>
                    {(enPaleta || !form.color) && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    )}
                    <input type="color" value={form.color || "#6366f1"} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" aria-label="Otro color" />
                  </label>
                </div>
              </Campo>
            </div>
          </Modal>
        );
      })()}

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
    </div>
  );
}
