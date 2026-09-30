import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, fmtDate, toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowIcon } from "../ui/Ledger";
import { printNotaCreditoDoc } from "../../helpers/printNotaCredito";
import ConfirmModal from "../ui/ConfirmModal";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";

const LIMIT = 30;

function NCDetailModal({ nc, onClose, onPrint, fmt }) {
  if (!nc) return null;
  const items   = nc.ReturnItems || [];
  const sale    = nc.Sale || {};
  const anulada = nc.status === "anulado";
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="shrink-0 pl-5 pr-3 pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-content-subtle">Nota de crédito</div>
              <div className={`text-[16px] font-bold tracking-[-0.01em] tabular-nums truncate ${anulada ? "text-content-subtle line-through decoration-1" : "text-content dark:text-white"}`}>
                {nc.nc_number || `NC-${nc.id}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {anulada && <StatusMark status="anulado" />}
            <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-1 space-y-5">
          {/* ── Cabecera: a quién y cuánto se le acreditó ── */}
          <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] text-content-subtle">Cliente</p>
              <p className="text-[15px] font-semibold text-content dark:text-white truncate">{toNameCase(sale.Customer?.name) || "Sin cliente"}</p>
              {sale.Customer?.rif && <p className="text-[12px] text-content-subtle tabular-nums">{sale.Customer.rif}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] text-content-subtle">Total acreditado</p>
              <Money value={fmt(nc.total)} strike={anulada} className={`block text-[24px] font-bold tracking-tight leading-tight ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`} />
            </div>
          </div>

          {/* ── Datos del documento ── */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {[
              ["Fecha",   fmtDate(nc.created_at)],
              ["Factura", sale.invoice_number || (sale.id ? `#${sale.id}` : "—")],
              ["Registró", toNameCase(nc.Employee?.full_name) || "—"],
            ].map(([label, val]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[12px] text-content-subtle">{label}</dt>
                <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums truncate">{val}</dd>
              </div>
            ))}
            {/* El motivo puede ser una frase: va a lo ancho, sin cortarse. */}
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-[12px] text-content-subtle">Motivo</dt>
              <dd className="text-[13px] font-medium text-content dark:text-white">{nc.reason || <span className="text-content-subtle/60">—</span>}</dd>
            </div>
          </dl>

          {/* ── Productos devueltos: dos renglones por línea ── */}
          <div>
            <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
              Productos devueltos <span className="font-normal text-content-subtle">· {items.length}</span>
            </p>
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
              {items.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-[13px] text-content-subtle">Sin líneas</p>
              ) : items.map((i, idx) => (
                <div key={idx} className="px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-content dark:text-white min-w-0 truncate">{i.name}</span>
                    <Money value={fmt(i.subtotal)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                  </div>
                  <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">{parseFloat(i.qty)} × {fmt(i.price)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="shrink-0 px-5 py-4 border-t border-border/60 dark:border-white/[0.06] flex gap-2">
          <button onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
          <button onClick={() => onPrint(nc)}
            className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir nota de crédito
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotasCreditoTab({ notify, fmtPrice }) {
  const { baseCurrency, activeCurrencies, companyInfo, printerWidth, can } = useApp();
  // Anular mueve inventario y saldos: es el mismo permiso que anular una factura.
  const canAnnul = can("sales.void");

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [selectedNC, setSelectedNC] = useState(null);
  const [toAnnul, setToAnnul]   = useState(null);
  const [annulling, setAnnulling] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setPage(p);
    try {
      const params = { page: p, limit: LIMIT, search };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.creditNotes.getAll(params);
      setItems(res.data || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  }, [search, dateFrom, dateTo, notify]);

  useEffect(() => { load(1); }, [load]);

  // Anular no borra la NC: el correlativo ya se emitió. Revierte inventario y saldo, y el
  // servidor rechaza los casos que no puede deshacer solo (un cambio de producto, o un
  // crédito que el cliente ya gastó) explicando qué hay que hacer antes.
  const handleAnnul = async () => {
    if (!toAnnul || annulling) return;
    setAnnulling(true);
    try {
      const res = await api.creditNotes.annul(toAnnul.id);
      notify(res.message || "Nota de crédito anulada", "ok");
      setToAnnul(null);
      setSelectedNC(null);
      load(page);
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setAnnulling(false);
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setShowFilterDrop(false);
  };

  const hasFilters = !!(dateFrom || dateTo);

  const handlePrint = (r) => {
    const sale = r.Sale || {};
    printNotaCreditoDoc(
      { nc_number: r.nc_number, total: r.total, reason: r.reason, created_at: r.created_at, return_id: r.id, items: r.ReturnItems || [] },
      { ...sale, customer_name: sale.Customer?.name || null, customer_rif: sale.Customer?.rif || null },
      companyInfo,
      baseCurrency,
      activeCurrencies,
      printerWidth
    );
  };

  const fmt = (n) => `${baseCurrency?.symbol || "Ref."} ${Number(n || 0).toFixed(2)}`;
  const clientName = (r) => r.Sale?.Customer?.name || "—";

  const subheader = (
    <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por NC# o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input h-9 pl-9 w-full"
        />
      </div>

      <div className="relative">
        <button
          onClick={() => setShowFilterDrop(p => !p)}
          className={["h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
            hasFilters
              ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
              : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
          ].join(" ")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filtros
          {hasFilters && (
            <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">1</span>
          )}
        </button>
        {showFilterDrop && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
            <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[70] popover-in">
              <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />
              </div>
              <div className="px-4 py-2">
                <button onClick={clearFilters} className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
                  Limpiar todo
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {subheader}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="overflow-auto flex-1">
          <table className="table-ledger min-w-[760px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="pl-4">Nota de crédito</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Factura</th>
                <th>Líneas</th>
                <th className="text-right">Total</th>
                <th>Empleado</th>
                <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LedgerSkeleton cols={8} />
              ) : items.length === 0 ? (
                <LedgerEmpty cols={8} title="Sin notas de crédito" hint="Las devoluciones facturadas aparecerán aquí." />
              ) : items.map(r => {
                const anulada = r.status === "anulado";
                const lineas = (r.ReturnItems || []).length;
                return (
                  <tr key={r.id} {...ledgerRow(() => setSelectedNC(r))}>
                    <td className="pl-4">
                      {r.nc_number
                        ? <span className={`text-[13px] font-semibold tabular-nums ${anulada ? "text-content-subtle line-through decoration-1" : "text-brand-700 dark:text-brand-300"}`}>{r.nc_number}</span>
                        : <StatusMark status="sin_serie" map={{ sin_serie: { label: "Sin serie", tone: "warning" } }} />
                      }
                      {anulada && <div className="mt-0.5"><StatusMark status="anulado" /></div>}
                    </td>
                    <td>
                      <span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(r.created_at)}</span>
                    </td>
                    <td className="max-w-0">
                      <span className={`block truncate font-semibold ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`}>{toNameCase(clientName(r))}</span>
                      {r.Sale?.Customer?.rif && (
                        <span className="block text-[12px] text-content-subtle tabular-nums">{r.Sale.Customer.rif}</span>
                      )}
                    </td>
                    <td>
                      <span className="text-[13px] font-medium text-content-subtle tabular-nums">
                        {r.Sale?.invoice_number || (r.Sale ? `#${r.Sale.id}` : "—")}
                      </span>
                    </td>
                    <td>
                      <span className="text-[12px] font-medium text-content-subtle tabular-nums">{lineas} {lineas === 1 ? "línea" : "líneas"}</span>
                    </td>
                    <td className="text-right">
                      <Money
                        value={`-${fmt(r.total)}`}
                        strike={anulada}
                        className={`text-[14px] font-semibold ${anulada ? "text-content-subtle" : "text-red-600 dark:text-red-400"}`}
                      />
                    </td>
                    <td className="max-w-[140px]">
                      <span className="block truncate text-[12px] font-medium text-content-subtle">{toNameCase(r.Employee?.full_name) || "—"}</span>
                    </td>
                    <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                      <div className="flex items-center justify-end gap-0.5">
                        <RowIcon icon="print" title="Imprimir nota de crédito" onClick={() => handlePrint(r)} />
                        {!anulada && canAnnul && (
                          <RowIcon icon="ban" tone="danger" title="Anular esta nota de crédito" onClick={() => setToAnnul(r)} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={pages} total={total} limit={LIMIT} onPageChange={load} />
      </div>

      <ConfirmModal
        isOpen={!!toAnnul}
        title={`Anular ${toAnnul?.nc_number || "nota de crédito"}`}
        message={
          `Esta acción devolverá el inventario al estado anterior a la devolución, le quitará al cliente ` +
          `el saldo a favor de ${fmt(toAnnul?.total)} y recalculará la factura. ` +
          `La nota queda registrada como anulada y su número no se reutiliza. ¿Continuar?`
        }
        confirmText={annulling ? "Anulando..." : "Sí, anular"}
        onConfirm={handleAnnul}
        onCancel={() => !annulling && setToAnnul(null)}
      />

      <NCDetailModal
        nc={selectedNC}
        onClose={() => setSelectedNC(null)}
        onPrint={handlePrint}
        fmt={fmt}
      />
    </div>
  );
}
