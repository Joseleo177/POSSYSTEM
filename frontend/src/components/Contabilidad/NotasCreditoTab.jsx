import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, fmtDate } from "../../helpers";
import { printNotaCreditoDoc } from "../../helpers/printNotaCredito";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";

const LIMIT = 30;

function NCDetailModal({ nc, onClose, onPrint, fmt }) {
  if (!nc) return null;
  const items = nc.ReturnItems || [];
  const sale  = nc.Sale || {};
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-warning/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning/10 text-warning border border-warning/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Nota de Crédito</div>
              <div className="text-sm font-black text-content dark:text-white">{nc.nc_number || `NC-${nc.id}`}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Meta */}
        <div className="shrink-0 px-5 py-3 border-b border-border/10 dark:border-white/5 grid grid-cols-2 gap-x-6 gap-y-2">
          {[
            ["Fecha",    fmtDate(nc.created_at)],
            ["Factura",  sale.invoice_number || (sale.id ? `#${sale.id}` : "—")],
            ["Cliente",  sale.Customer?.name || "—"],
            ["CI/RIF",   sale.Customer?.rif  || "—"],
            ["Empleado", nc.Employee?.full_name || "—"],
            ["Motivo",   nc.reason || "—"],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">{label}</p>
              <p className="text-[11px] font-bold text-content dark:text-white truncate">{val}</p>
            </div>
          ))}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">Productos devueltos</div>
          <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
            <div className="grid grid-cols-12 bg-surface-2 dark:bg-white/[0.03] px-3 py-2">
              <span className="col-span-5 text-[10px] font-black uppercase text-content-subtle dark:text-white/30">Producto</span>
              <span className="col-span-2 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-center">Cant.</span>
              <span className="col-span-2 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-right">P.Unit</span>
              <span className="col-span-3 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-right">Subtotal</span>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-content-subtle dark:text-white/30">Sin líneas</div>
            ) : items.map((i, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center px-3 py-2.5 border-t border-border/10 dark:border-white/5">
                <div className="col-span-5 text-[11px] font-bold text-content dark:text-white truncate">{i.name}</div>
                <div className="col-span-2 text-center text-[11px] font-bold text-content dark:text-white tabular-nums">{parseFloat(i.qty)}</div>
                <div className="col-span-2 text-right text-[11px] text-content-subtle dark:text-white/40 tabular-nums">{fmt(i.price)}</div>
                <div className="col-span-3 text-right text-[11px] font-black text-content dark:text-white tabular-nums">{fmt(i.subtotal)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Total + footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Total acreditado</p>
            <p className="text-2xl font-black text-warning tabular-nums">{fmt(nc.total)}</p>
          </div>
          <button onClick={() => onPrint(nc)}
            className="h-9 px-4 rounded-xl border border-brand-500/30 text-brand-500 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir NC
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotasCreditoTab({ notify, fmtPrice }) {
  const { baseCurrency, activeCurrencies, companyInfo } = useApp();

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
      activeCurrencies
    );
  };

  const fmt = (n) => `${baseCurrency?.symbol || "Ref."}${Number(n || 0).toFixed(2)}`;
  const clientName = (r) => r.Sale?.Customer?.name || "—";

  const subheader = (
    <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por NC# o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input h-8 pl-8 text-[11px] w-full"
        />
      </div>

      <div className="relative">
        <button
          onClick={() => setShowFilterDrop(p => !p)}
          className={["h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
            hasFilters
              ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
              : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
          ].join(" ")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filtros
          {hasFilters && (
            <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">1</span>
          )}
        </button>
        {showFilterDrop && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
            <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Rango de Fecha</div>
                <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />
              </div>
              <div className="px-4 py-2">
                <button onClick={clearFilters} className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
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
        <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
          <table className="table-pos min-w-[680px]">
            <thead className="sticky top-0 z-10">
              <tr>
                {["NC #", "Fecha", "Cliente", "Factura", "Items", "Total", "Empleado", ""].map(h => (
                  <th key={h} className={h === "Total" || h === "" ? "text-right pr-6" : "text-left"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Cargando notas de crédito...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin notas de crédito emitidas</td></tr>
              ) : items.map(r => (
                <tr key={r.id} className="group">
                  <td>
                    {r.nc_number
                      ? <span className="text-[11px] font-black text-brand-500 tracking-tight">{r.nc_number}</span>
                      : <span className="badge badge-warning shadow-none">Sin serie</span>
                    }
                  </td>
                  <td>
                    <span className="text-[11px] font-bold text-content-subtle uppercase">{fmtDateShort(r.created_at)}</span>
                  </td>
                  <td className="truncate max-w-[180px]">
                    <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate block">{clientName(r)}</span>
                    {r.Sale?.Customer?.rif && (
                      <span className="text-[9px] font-black opacity-30 uppercase">{r.Sale.Customer.rif}</span>
                    )}
                  </td>
                  <td>
                    <span className="text-[11px] font-bold text-content-subtle dark:text-white/50">
                      {r.Sale?.invoice_number || (r.Sale ? `#${r.Sale.id}` : "—")}
                    </span>
                  </td>
                  <td>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-3 dark:bg-white/5 border border-border/20 dark:border-white/10 text-content-subtle dark:text-white/40">
                      {(r.ReturnItems || []).length} línea{(r.ReturnItems || []).length !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="text-right pr-6">
                    <span className="text-[12px] font-black text-danger tabular-nums">-{fmt(r.total)}</span>
                  </td>
                  <td>
                    <span className="text-[11px] font-medium text-content-subtle dark:text-white/30 truncate block max-w-[120px]">
                      {r.Employee?.full_name || "—"}
                    </span>
                  </td>
                  <td className="text-right pr-6">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedNC(r)}
                        className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all bg-brand-500/10 text-brand-500 border-brand-500/20 hover:bg-brand-500 hover:text-black"
                      >
                        Detalles
                      </button>
                      <button
                        onClick={() => handlePrint(r)}
                        className="p-2 rounded-xl transition-all text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 active:scale-90"
                        title="Imprimir NC"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={pages} total={total} limit={LIMIT} onPageChange={load} />
      </div>

      <NCDetailModal
        nc={selectedNC}
        onClose={() => setSelectedNC(null)}
        onPrint={handlePrint}
        fmt={fmt}
      />
    </div>
  );
}
