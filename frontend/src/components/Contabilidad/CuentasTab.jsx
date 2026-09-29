import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import { fmtDateShort, toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { ledgerRow } from "../ui/Ledger";
import Check from "../ui/Check";
import CustomSelect from "../ui/CustomSelect";

/**
 * Pantalla común de Cuentas por Pagar y Cuentas por Cobrar.
 *
 * Las dos son el mismo tablero —saldo, vencido, antigüedad por vencimiento, vista por contacto
 * y por documento, selección para pagar/cobrar varias juntas— sobre datos distintos. Lo que
 * cambia lo da `config` (ver CuentasPorPagarTab y CuentasPorCobrarTab):
 *
 *   fetch(params)       – pide los datos; devuelve { summary, aging, invoices, contacts, due_soon_days }
 *   contact(x)          – { key, name, rif } de un contacto o de un documento
 *   docLabel(inv)       – cómo se nombra el documento en la fila ("#49", "A-0082")
 *   canAct              – si el usuario puede pagar/cobrar
 *   actionLabel         – "Pagar" / "Cobrar";  bulkActionLabel – "Pagar juntas" / "Cobrar juntas"
 *   groupRuleText       – por qué una fila no se puede sumar a la selección
 *   warehouseFilter(w)  – qué sucursales se ofrecen en el filtro
 *   text                – etiquetas: contacto, contactos, doc, docs, searchPlaceholder, emptyContacts,
 *                         emptyDocs, loading, totalLabel, viewDocLabel, docDateLabel
 *   renderModals({ toAct, closeAct, detailId, closeDetail, reload, afterAct })
 *                       – los modales de pago/cobro y de detalle, propios de cada lado
 */

// Tramos de antigüedad, en el orden en que llegan del servidor (días después del vencimiento).
const BUCKETS = [
  // Por vencer: en azul informativo, no en verde, que sugería "pagado".
  { key: "current",  color: "bg-sky-500",    text: "text-sky-500" },
  { key: "d1_30",    color: "bg-warning",    text: "text-warning" },
  { key: "d31_60",   color: "bg-orange-500", text: "text-orange-500" },
  { key: "d61_90",   color: "bg-danger/70",  text: "text-danger" },
  { key: "d90_plus", color: "bg-danger",     text: "text-danger" },
];

const bucketOf = (days) =>
  days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";

// Estado del vencimiento en palabras: lo que se lee de un vistazo en la fila.
export function DueBadge({ days, soonDays = 7 }) {
  const mark = (label, tone) => <StatusMark status="x" map={{ x: { label, tone } }} />;
  if (days > 0)          return mark(`Vencida ${days} d`, "danger");
  if (days === 0)        return mark("Vence hoy", "warning");
  if (-days <= soonDays) return mark(`Vence en ${-days} d`, "warning");
  // Con margen: se dice cuánto falta, en gris y sin punto. Un "Al día" en verde se leía como pagada.
  return <span className="text-[12px] font-medium text-content-subtle whitespace-nowrap">Vence en {-days} d</span>;
}

// Filete rojo o ámbar en la fila: lo mismo que dice DueBadge, visto desde el borde.
const dueTone = (days, soonDays = 7) => days > 0 ? "#ef4444" : -days <= soonDays ? "#f59e0b" : undefined;

// Misma fila móvil que los reportes (ver InventoryReport): nombre a todo el ancho y las cifras
// debajo con su etiqueta, en vez de una tabla que obliga a desplazarse en horizontal.
const MobileRow = ({ lead, title, sub, badge, metrics, actions, onClick }) => (
  <div className="px-4 py-3" onClick={onClick}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex items-start gap-2.5">
        {lead}
        <div className="min-w-0">
          <div className="text-[12px] font-bold leading-snug break-words text-content dark:text-white">{title}</div>
          {sub && <div className="text-[11px] font-semibold text-content-subtle uppercase mt-0.5 break-words">{sub}</div>}
        </div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {metrics.map(m => (
        <div key={m.label} className="min-w-0">
          <div className="text-[12px] font-medium text-content-subtle/70">{m.label}</div>
          <div className={`text-[12px] tabular-nums font-bold ${m.className || "text-content dark:text-white"}`}>{m.value}</div>
        </div>
      ))}
    </div>
    {actions && <div className="mt-2.5 flex gap-2">{actions}</div>}
  </div>
);

const Kpi = ({ label, value, sub, color = "text-content dark:text-white" }) => (
  <div className="rounded-xl border border-border dark:border-white/5 bg-white dark:bg-white/5 p-3 flex flex-col gap-1 shadow-sm min-w-0">
    <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted uppercase tracking-wide leading-none">{label}</div>
    <div className={`text-lg sm:text-xl font-bold ${color} tracking-tight leading-none tabular-nums truncate`}>{value}</div>
    {sub && <div className="text-[11px] font-semibold text-content-muted dark:text-content-dark-muted opacity-60 truncate">{sub}</div>}
  </div>
);

function Empty({ text }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-2 text-content-subtle">
      <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs font-bold">{text}</p>
    </div>
  );
}

// Cobrar/pagar es la acción con peso de la fila: en tinta (ver RowCta en ui/Ledger).
const BTN_ACT  = "h-8 px-3 rounded-lg text-[12px] font-semibold btn-accent active:scale-95 transition-all whitespace-nowrap disabled:opacity-40";
const BTN_VIEW = "h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors border-border dark:border-white/10 text-content-muted hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white whitespace-nowrap";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Plazo del contacto. En clientes sin excepción sale del plazo general de la empresa, y se
// dice: si no, un cliente con "15 días" no se distingue de uno al que se le dio a propósito.
const creditText = (c) => {
  const base = c.credit_days ? `${c.credit_days} días` : "Contado";
  return c.credit_is_default ? `${base} (general)` : base;
};

export default function CuentasTab({ notify, fmtPrice, config }) {
  const { text: t, contact, docLabel, canAct } = config;

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState("contactos");
  const [search, setSearch]     = useState("");
  const [debounced, setDebounced] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses]   = useState([]);
  // Filtros locales sobre lo ya traído: un contacto elegido en la otra vista, o un tramo de
  // antigüedad tocado en la barra.
  const [contactFilter, setContactFilter] = useState(null);
  const [bucketFilter, setBucketFilter]   = useState(null);
  // Documentos a pagar/cobrar en el modal: uno (botón de la fila) o varios (selección).
  const [toAct, setToAct]       = useState(null);
  const [detailId, setDetailId] = useState(null);
  // Selección para pagar/cobrar varios juntos, por id de documento.
  const [selected, setSelected] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api.warehouses.getAll()
      .then(r => setWarehouses((r.data || []).filter(config.warehouseFilter || (() => true))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (debounced.trim()) params.search = debounced.trim();
      if (warehouseId)      params.warehouse_id = warehouseId;
      setData(await config.fetch(params));
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, warehouseId, notify]);

  useEffect(() => { load(); }, [load]);

  // Tras recargar, la selección se queda solo con los documentos que siguen abiertos, y con su
  // saldo actualizado: uno que se saldó por otro lado no debe seguir sumando.
  useEffect(() => {
    const vigentes = Object.fromEntries((data?.invoices || []).map(i => [i.id, i]));
    setSelected(prev => Object.fromEntries(
      Object.keys(prev).filter(id => vigentes[id]).map(id => [id, vigentes[id]])
    ));
  }, [data]);

  const s         = data?.summary;
  const aging     = data?.aging || {};
  const soonDays  = data?.due_soon_days ?? 7;
  const contacts  = data?.contacts || [];

  const invoices = (data?.invoices || []).filter(i =>
    (!contactFilter || contact(i).key === contactFilter.key) &&
    (!bucketFilter  || bucketOf(i.days_overdue) === bucketFilter)
  );

  const openContact = (c) => {
    setContactFilter({ key: contact(c).key, name: contact(c).name });
    setView("documentos");
  };

  // Pagar/cobrar varios juntos: un solo movimiento de dinero, así que solo documentos del
  // mismo contacto y de la misma sucursal (el servidor lo exige igual).
  const groupKey   = (inv) => `${contact(inv).key}|${inv.warehouse_id ?? "-"}`;
  const selList    = Object.values(selected);
  const selGroup   = selList.length ? groupKey(selList[0]) : null;
  const selBalance = selList.reduce((acc, i) => acc + (parseFloat(i.balance) || 0), 0);
  const canSelect  = (inv) => canAct && (!selGroup || groupKey(inv) === selGroup);
  const toggle = (inv) => setSelected(prev => {
    const next = { ...prev };
    if (next[inv.id]) delete next[inv.id]; else next[inv.id] = inv;
    return next;
  });
  // "Seleccionar todas" dentro del contacto filtrado: las de la sucursal de lo ya elegido o,
  // si no hay nada elegido, las de la primera de la lista.
  const selectAllVisible = () => {
    const grupo = selGroup || (invoices[0] && groupKey(invoices[0]));
    setSelected(prev => {
      const next = { ...prev };
      invoices.filter(i => groupKey(i) === grupo).forEach(i => { next[i.id] = i; });
      return next;
    });
  };

  const checkbox = (inv) => {
    if (!canAct) return null;
    const on = !!selected[inv.id];
    const enabled = on || canSelect(inv);
    return (
      <Check
        checked={on}
        disabled={!enabled}
        onChange={() => toggle(inv)}
        title={enabled ? `Seleccionar para ${config.actionLabel.toLowerCase()} varias juntas` : config.groupRuleText}
      />
    );
  };

  const actButton = (inv) => canAct && (
    <button onClick={(e) => { e.stopPropagation(); setToAct([inv]); }} className={BTN_ACT}>{config.actionLabel}</button>
  );
  // El detalle se abre aquí mismo: ir a otro módulo sacaba al usuario de Contabilidad y le
  // hacía perder los filtros de esta pantalla.
  const viewButton = (inv) => (
    <button onClick={(e) => { e.stopPropagation(); setDetailId(inv.id); }} className={BTN_VIEW}>{t.viewDocLabel}</button>
  );

  const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";
  const totalAging = BUCKETS.reduce((acc, b) => acc + (aging[b.key]?.amount || 0), 0);
  const showSelectAll = view === "documentos" && contactFilter && canAct && invoices.length > 1;

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Toolbar ─────────────────────────── */}
      <div className="px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2 bg-white dark:bg-transparent">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            autoComplete="off"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input h-9 pl-9 text-[12px] w-full"
          />
        </div>
        {warehouses.length > 1 && (
          <CustomSelect
            value={warehouseId}
            onChange={setWarehouseId}
            placeholder={todasLabel}
            boxClassName="h-9 min-w-[190px]"
            options={[
              { value: "", label: todasLabel },
              ...warehouses.map(w => ({ value: String(w.id), label: w.name })),
            ]}
          />
        )}
        <button onClick={load} disabled={loading} title="Actualizar"
          className="h-9 w-9 rounded-lg border border-border/30 dark:border-white/10 bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle hover:text-brand-500 transition-all">
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* ── KPIs ─────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label={t.totalLabel} value={fmtPrice(s?.total_balance)} sub={`${plural(s?.invoice_count ?? 0, t.doc, t.docs)} con saldo`} color="text-brand-500" />
          <Kpi label="Vencido" value={fmtPrice(s?.overdue_balance)} sub={plural(s?.overdue_count ?? 0, t.doc, t.docs)} color={s?.overdue_balance > 0 ? "text-danger" : "text-content dark:text-white"} />
          <Kpi label={`Vence en ${soonDays} días`} value={fmtPrice(s?.due_soon_balance)} sub={plural(s?.due_soon_count ?? 0, t.doc, t.docs)} color={s?.due_soon_balance > 0 ? "text-warning" : "text-content dark:text-white"} />
          <Kpi label={t.contactsTitle} value={s?.contact_count ?? 0} sub="con saldo pendiente" />
        </div>

        {/* ── Antigüedad ───────────────────── */}
        <div className="rounded-xl border border-border dark:border-white/5 bg-white dark:bg-white/5 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted uppercase tracking-wide">Antigüedad por vencimiento</div>
            {bucketFilter && (
              <button onClick={() => setBucketFilter(null)} className="text-[11px] font-bold uppercase tracking-wide text-brand-500">Quitar filtro</button>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex bg-border/20 dark:bg-white/5">
            {totalAging > 0 && BUCKETS.map(b => {
              const amt = aging[b.key]?.amount || 0;
              return amt > 0 ? <div key={b.key} className={b.color} style={{ width: `${(amt / totalAging) * 100}%` }} /> : null;
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {BUCKETS.map(b => {
              const a = aging[b.key] || {};
              const active = bucketFilter === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => { setBucketFilter(active ? null : b.key); setView("documentos"); }}
                  className={`text-left rounded-lg px-2.5 py-2 border transition-all ${active ? "border-brand-500/50 bg-brand-500/5" : "border-border/30 dark:border-white/5 hover:border-border dark:hover:border-white/20"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${b.color}`} />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-content-subtle">{a.label || b.key}</span>
                  </div>
                  <div className={`text-[13px] font-bold tabular-nums mt-0.5 ${a.amount > 0 ? b.text : "text-content-subtle/50"}`}>{fmtPrice(a.amount)}</div>
                  <div className="text-[11px] font-semibold text-content-subtle/70">{plural(a.count || 0, t.doc, t.docs)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Vistas ───────────────────────── */}
        <div className="rounded-xl border border-border dark:border-white/5 bg-white dark:bg-white/5 shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 px-3 border-b border-border/20 dark:border-white/5 flex-wrap">
            {[["contactos", `Por ${t.contact} (${contacts.length})`], ["documentos", `Por ${t.doc} (${invoices.length})`]].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap ${view === k ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle hover:text-content dark:hover:text-white"}`}>
                {label}
              </button>
            ))}
            {showSelectAll && (
              <button onClick={selectAllVisible}
                className="ml-auto my-1.5 h-7 px-2.5 rounded-lg text-[11px] font-bold text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 transition-all">
                Seleccionar todas
              </button>
            )}
            {view === "documentos" && contactFilter && (
              <span className={`${showSelectAll ? "" : "ml-auto"} my-1.5 inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-lg bg-brand-500/10 text-brand-500 text-[11px] font-bold max-w-full`}>
                <span className="truncate">{contactFilter.name}</span>
                <button onClick={() => setContactFilter(null)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-brand-500/20" title="Quitar filtro">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
          </div>

          {loading && !data ? (
            <div className="py-16 text-center text-brand-500 animate-pulse text-xs font-bold">{t.loading}</div>
          ) : view === "contactos" ? (
            contacts.length === 0 ? (
              <Empty text={t.emptyContacts} />
            ) : (
              <>
                <div className="lg:hidden divide-y divide-border/20 dark:divide-white/5">
                  {contacts.map(c => (
                    <MobileRow
                      key={contact(c).key}
                      onClick={() => openContact(c)}
                      title={contact(c).name}
                      sub={[contact(c).rif, creditText(c)].filter(Boolean).join(" · ")}
                      badge={<DueBadge days={c.max_days_overdue} soonDays={soonDays} />}
                      metrics={[
                        { label: "Saldo", value: fmtPrice(c.balance), className: "text-brand-500" },
                        { label: "Vencido", value: fmtPrice(c.overdue_balance), className: c.overdue_balance > 0 ? "text-danger" : "text-content-subtle" },
                        { label: t.docsTitle, value: c.invoice_count },
                        { label: "Próximo venc.", value: fmtDateShort(c.next_due_date) },
                      ]}
                    />
                  ))}
                </div>
                <table className="table-ledger hidden lg:table">
                  <thead>
                    <tr>
                      <th className="pl-4">{t.contactTitle}</th>
                      <th className="text-left">Crédito</th>
                      <th className="text-center">{t.docsTitle}</th>
                      <th className="text-left">Próximo venc.</th>
                      <th className="text-left">Estado</th>
                      <th className="text-right">Vencido</th>
                      <th className="text-right pr-4">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={contact(c).key} {...ledgerRow(() => openContact(c), dueTone(c.max_days_overdue, soonDays))}>
                        <td className="pl-4">
                          <span className="font-semibold text-content dark:text-white block">{contact(c).name}</span>
                          {contact(c).rif && <span className="text-[12px] text-content-subtle tabular-nums">{contact(c).rif}</span>}
                        </td>
                        <td><span className="text-[12px] font-semibold text-content-subtle">{creditText(c)}</span></td>
                        <td className="text-center"><span className="text-[12px] font-bold tabular-nums">{c.invoice_count}</span></td>
                        <td><span className="text-[12px] font-semibold text-content-subtle tabular-nums">{fmtDateShort(c.next_due_date)}</span></td>
                        <td><DueBadge days={c.max_days_overdue} soonDays={soonDays} /></td>
                        <td className="text-right"><Money value={fmtPrice(c.overdue_balance)} className={`text-[13px] font-medium ${c.overdue_balance > 0 ? "text-red-600 dark:text-red-400" : "text-content-subtle/60"}`} /></td>
                        <td className="text-right pr-4"><Money value={fmtPrice(c.balance)} className="text-[14px] font-semibold text-content dark:text-white" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          ) : invoices.length === 0 ? (
            <Empty text={contactFilter || bucketFilter ? `Ninguna ${t.doc} abierta con este filtro` : t.emptyDocs} />
          ) : (
            <>
              <div className="lg:hidden divide-y divide-border/20 dark:divide-white/5">
                {invoices.map(inv => (
                  <MobileRow
                    key={inv.id}
                    lead={checkbox(inv)}
                    title={contact(inv).name}
                    sub={[docLabel(inv), inv.warehouse_name].filter(Boolean).join(" · ")}
                    badge={<DueBadge days={inv.days_overdue} soonDays={soonDays} />}
                    metrics={[
                      { label: "Saldo", value: fmtPrice(inv.balance), className: "text-brand-500" },
                      { label: "Vence", value: fmtDateShort(inv.due_date) },
                      { label: "Total", value: fmtPrice(inv.total) },
                      { label: t.docDateLabel, value: fmtDateShort(inv.created_at) },
                    ]}
                    actions={<>{actButton(inv)}{viewButton(inv)}</>}
                  />
                ))}
              </div>
              <table className="table-ledger hidden lg:table">
                <thead>
                  <tr>
                    {canAct && <th className="w-10 pl-4"></th>}
                    <th className={canAct ? "" : "pl-4"}>{t.docTitle}</th>
                    <th className="text-left">{t.contactTitle}</th>
                    <th className="text-left">Sucursal</th>
                    <th className="text-left">Fecha</th>
                    <th className="text-left">Vence</th>
                    <th className="text-left">Estado</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Saldo</th>
                    <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} {...ledgerRow(() => setDetailId(inv.id), dueTone(inv.days_overdue, soonDays))} {...(selected[inv.id] && { className: "ledger-row [&>td]:!bg-brand-500/[0.05]" })}>
                      {canAct && <td className="pl-4">{checkbox(inv)}</td>}
                      <td className={canAct ? "" : "pl-4"}><span className="text-[13px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums whitespace-nowrap">{docLabel(inv)}</span></td>
                      <td className="max-w-[220px]">
                        <span className="font-semibold text-content dark:text-white truncate block">{contact(inv).name}</span>
                        {contact(inv).rif && <span className="text-[12px] text-content-subtle tabular-nums">{contact(inv).rif}</span>}
                      </td>
                      <td><span className="text-[12px] font-semibold text-content-subtle">{toNameCase(inv.warehouse_name) || "—"}</span></td>
                      <td><span className="text-[12px] font-semibold text-content-subtle tabular-nums">{fmtDateShort(inv.created_at)}</span></td>
                      <td>
                        <span className="text-[12px] font-semibold text-content dark:text-white tabular-nums">{fmtDateShort(inv.due_date)}</span>
                        {inv.has_fixed_due && <span className="block text-[12px] text-content-subtle">Pactada</span>}
                      </td>
                      <td><DueBadge days={inv.days_overdue} soonDays={soonDays} /></td>
                      <td className="text-right"><Money value={fmtPrice(inv.total)} className="text-[13px] font-medium text-content-subtle" /></td>
                      <td className="text-right"><Money value={fmtPrice(inv.balance)} className="text-[14px] font-semibold text-content dark:text-white" /></td>
                      {/* La fila abre el detalle: en escritorio sobra el botón "Ver". */}
                      <td className="pr-4 whitespace-nowrap cursor-default" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">{actButton(inv)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* Barra de la selección: pegada al pie del área desplazable, visible mientras se
          recorre la lista para seguir marcando documentos. */}
      {selList.length > 0 && (
        <div className="sticky bottom-0 z-20 px-4 pb-4">
          <div className="rounded-xl border border-brand-500/30 bg-white dark:bg-surface-dark-2 shadow-2xl shadow-black/20 px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-content-subtle">
                {plural(selList.length, t.doc, t.docs)} · {contact(selList[0]).name}
              </div>
              <div className="text-[15px] font-bold text-brand-500 tabular-nums">{fmtPrice(selBalance)}</div>
            </div>
            <button onClick={() => setSelected({})}
              className="h-9 px-4 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-bold text-content-subtle hover:text-content dark:hover:text-white transition-all">
              Limpiar
            </button>
            <button onClick={() => setToAct(selList)}
              className="h-9 px-5 rounded-xl btn-accent text-[11px] font-bold transition-all">
              {selList.length > 1 ? config.bulkActionLabel : config.actionLabel}
            </button>
          </div>
        </div>
      )}

      {config.renderModals({
        toAct,
        closeAct: () => setToAct(null),
        afterAct: () => { setToAct(null); setSelected({}); load(); },
        detailId,
        closeDetail: () => setDetailId(null),
        reload: load,
      })}
    </div>
  );
}
