import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import PaymentFormModal from "../PaymentFormModal";

export default function PagosTab({ 
  notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale 
}) {
  const [payStats,       setPayStats]       = useState(null);
  const [pendingSales,   setPendingSales]   = useState([]);
  const [payments,       setPayments]       = useState([]);
  const [payDateFrom,    setPayDateFrom]    = useState("");
  const [payDateTo,      setPayDateTo]      = useState("");
  const [payDetail,      setPayDetail]      = useState(null);
  const [payModal,       setPayModal]       = useState(null);   // sale que se va a pagar
  
  // Odoo-style Search & Filters
  const [searchTerm,     setSearchTerm]     = useState("");
  const [activeFilters,  setActiveFilters]  = useState([]); // ['pendientes', 'parciales', 'anulados']
  const [groupBy,       setGroupBy]       = useState(null); // 'cliente', 'fecha'
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [showGroupDrop,  setShowGroupDrop]  = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      const params = {};
      if (payDateFrom) params.date_from = payDateFrom;
      if (payDateTo)   params.date_to   = payDateTo;
      const [stR, pendR, histR] = await Promise.all([
        api.payments.getStats(params),
        api.payments.getPending(),
        api.payments.getAll(params),
      ]);
      setPayStats(stR.data);
      setPendingSales(pendR.data);
      setPayments(histR.data);
    } catch (e) { notify(e.message, "err"); }
  }, [payDateFrom, payDateTo, notify]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  // ── Filtrado y Agrupación ──────────────────────────────────
  const toggleFilter = (f) => {
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const allMovements = [
    ...pendingSales.map(s => ({ ...s, _type: 'invoice' })), 
    ...payments.map(p => ({ ...p, _type: 'payment' }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filteredMovements = allMovements.filter(item => {
    const search = searchTerm.toLowerCase();
    const subTarget = item._type === 'invoice' 
      ? (item.customer_name || "") + " " + (item.invoice_number || "") + " " + (item.customer_rif || "")
      : (item.customer_name || "") + " " + (item.invoice_number || "") + " " + (item.reference_number || "");
    
    const matchesSearch = !searchTerm || subTarget.toLowerCase().includes(search);
    if (!matchesSearch) return false;

    if (activeFilters.length > 0) {
      if (activeFilters.includes('pendientes') && (item.status === 'pendiente' || item._type === 'invoice' && item.status === 'pendiente')) return true;
      if (activeFilters.includes('parciales') && item.status === 'parcial') return true;
      if (activeFilters.includes('pagado') && (item.status === 'pagado' || item._type === 'payment')) return true;
      return false;
    }
    return true;
  });

  const groupData = (list) => {
    if (!groupBy) return [{ key: 'all', items: list }];
    const groups = {};
    list.forEach(item => {
      let key = 'Sin grupo';
      if (groupBy === 'cliente') key = item.customer_name || 'Sin cliente';
      if (groupBy === 'fecha')   key = new Date(item.created_at).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).map(([key, items]) => ({ key, items }));
  };

  const removePayment = async (payId) => {
    if (!window.confirm("¿Eliminar este pago? El estado de la factura se recalculará.")) return;
    try {
      await api.payments.remove(payId);
      notify("Pago eliminado");
      loadPayments();
    } catch (e) { notify(e.message, "err"); }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── BARRA DE BÚSQUEDA Y FILTROS (ODOO STYLE) ── */}
      <div className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="flex-1 min-w-[280px] relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle opacity-50">🔍</span>
            <input 
              type="text" 
              placeholder="Buscar por cliente, RIF o factura..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-surface-2 dark:bg-surface-dark border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-500/20 transition-all outline-none"
            />
          </div>

          {/* Filtros Dropdown */}
          <div className="relative">
            <button 
              onClick={() => { setShowFilterDrop(!showFilterDrop); setShowGroupDrop(false); }}
              className={[
                "flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                activeFilters.length > 0 
                  ? "bg-brand-500/10 text-brand-500 border-brand-500/30" 
                  : "bg-surface-2 dark:bg-surface-dark-3 text-content-subtle border-transparent hover:border-border"
              ].join(" ")}
            >
              <span className="text-xs">⏳</span> Filtros
              {activeFilters.length > 0 && <span className="bg-brand-500 text-black w-4 h-4 rounded-full flex items-center justify-center text-[8px]">{activeFilters.length}</span>}
            </button>
            {showFilterDrop && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {[
                    { id: 'pendientes', label: 'Facturas Pendientes', icon: '🔴' },
                    { id: 'parciales', label: 'Pagos Parciales', icon: '🟡' },
                    { id: 'pagado', label: 'Pagadas', icon: '🟢' },
                  ].map(f => (
                    <button 
                      key={f.id}
                      onClick={() => toggleFilter(f.id)}
                      className="w-full px-5 py-3.5 text-left flex items-center justify-between hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors border-none cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm">{f.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-content">{f.label}</span>
                      </div>
                      {activeFilters.includes(f.id) && <span className="text-success text-xs">✓</span>}
                    </button>
                  ))}

                  <div className="border-t border-border/50 p-4 space-y-3 bg-surface-2/30 dark:bg-surface-dark-3/30">
                    <div className="text-[8px] font-black uppercase tracking-widest text-content-subtle">Rango de Fecha</div>
                    <div className="flex flex-col gap-2">
                      <input type="date" value={payDateFrom} onChange={e => setPayDateFrom(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-brand-500/20" />
                      <input type="date" value={payDateTo} onChange={e => setPayDateTo(e.target.value)}
                        className="w-full bg-white dark:bg-surface-dark border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-brand-500/20" />
                    </div>
                    {(payDateFrom || payDateTo) && (
                      <button onClick={() => { setPayDateFrom(""); setPayDateTo(""); }}
                        className="w-full py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest text-danger hover:bg-danger/5 transition-colors border border-danger/20">
                        ✕ Limpiar Fechas
                      </button>
                    )}
                  </div>

                  <div className="border-t border-border/50 p-2">
                    <button 
                      onClick={() => setActiveFilters([])}
                      className="w-full py-2 rounded-lg text-[8px] font-black uppercase tracking-widest text-danger hover:bg-danger/5 transition-colors"
                    >
                      Limpiar Filtros de Estado
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Agrupar por Dropdown */}
          <div className="relative">
            <button 
              onClick={() => { setShowGroupDrop(!showGroupDrop); setShowFilterDrop(false); }}
              className={[
                "flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                groupBy 
                  ? "bg-info/10 text-info border-info/30" 
                  : "bg-surface-2 dark:bg-surface-dark-3 text-content-subtle border-transparent hover:border-border"
              ].join(" ")}
            >
              <span className="text-xs">📦</span> Agrupar por
            </button>
            {showGroupDrop && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowGroupDrop(false)} />
                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {[
                    { id: 'cliente', label: 'Cliente', icon: '👤' },
                    { id: 'fecha', label: 'Fecha de Factura', icon: '📅' },
                  ].map(g => (
                    <button 
                      key={g.id}
                      onClick={() => { setGroupBy(groupBy === g.id ? null : g.id); setShowGroupDrop(false); }}
                      className="w-full px-5 py-3.5 text-left flex items-center justify-between hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors border-none cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm">{g.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-content">{g.label}</span>
                      </div>
                      {groupBy === g.id && <span className="text-info text-xs">●</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MOVIMIENTOS UNIFICADOS ── */}
      <div className="space-y-6">

        {filteredMovements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-surface-dark-2 rounded-2xl border border-dashed border-border dark:border-border-dark opacity-60">
            <div className="text-4xl mb-4">📜</div>
            <div className="text-xs font-black uppercase tracking-widest text-content-muted">No se encontraron movimientos registrados</div>
          </div>
        ) : (
          groupData(filteredMovements).map(group => (
            <div key={group.key} className="animate-in fade-in duration-500">
              <div className="flex items-center gap-3 mb-4 ml-2">
                <div className="h-4 w-1 bg-brand-500 rounded-full" />
                <span className="text-[11px] font-black uppercase tracking-[2px] text-content">{group.key}</span>
                <span className="text-[10px] font-bold text-content-subtle">({group.items.length})</span>
              </div>
              
              <div className="space-y-2">
                {group.items.map(item => {
                  const isInvoice = item._type === 'invoice';
                  const isPartial = item.status === 'parcial';
                  const isPaid    = item.status === 'pagado' || !isInvoice;

                  return (
                    <div key={`${item._type}-${item.id}`} className="group bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark hover:border-brand-500/30 rounded-xl overflow-hidden transition-all duration-200">
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        {/* Info Principal */}
                        <div className="flex items-center gap-6 flex-1 min-w-0">
                          {/* Indicador de Estado */}
                          <div 
                            className={[
                              "w-2 h-2 rounded-full shadow-sm",
                              isPaid ? "bg-success" : (isPartial ? "bg-brand-500 animate-pulse" : "bg-danger")
                            ].join(" ")} 
                            title={isPaid ? "Cobrado" : (isPartial ? "Parcial" : "Pendiente")}
                          />
                          
                          {/* Referencia / Factura */}
                          <div className="flex flex-col min-w-[120px]">
                            <span className="text-[11px] font-black text-brand-500 tracking-tight">
                              {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                            </span>
                            <span className="text-[8px] font-bold text-content-subtle uppercase tracking-widest">
                              {isInvoice ? "Factura" : "Cobro Recibido"}
                            </span>
                          </div>

                          {/* Cliente */}
                          <div className="flex items-center gap-2 flex-1 truncate">
                            <span className="text-lg opacity-40">👤</span>
                            <div className="flex flex-col truncate">
                              <span className="text-[11px] font-black text-content dark:text-content-dark truncate">
                                {item.customer_name || "Consumidor Final"}
                              </span>
                              {!isInvoice && item.reference_number && (
                                <span className="text-[8px] font-bold text-content-subtle uppercase tracking-widest">
                                  Ref: {item.reference_number}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Fecha */}
                          <div className="hidden lg:block text-[10px] font-bold text-content-subtle uppercase min-w-[100px]">
                            {new Date(item.created_at).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Montos y Acciones */}
                        <div className="flex items-center gap-8">
                          <div className="flex flex-col items-end min-w-[120px]">
                            <span className={["text-xs font-black tracking-tight", isPaid ? "text-success" : "text-brand-500"].join(" ")}>
                              {isInvoice ? fmtPrice(item.total) : fmtPayment(item)}
                            </span>
                            {isInvoice && isPartial && (
                              <span className="text-[9px] font-bold text-danger uppercase tracking-tighter">
                                Saldo: {fmtPrice(item.balance)}
                              </span>
                            )}
                            {!isInvoice && item.journal_name && (
                              <span className="text-[9px] font-bold text-content-subtle uppercase tracking-widest">
                                {item.journal_name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isInvoice ? (
                              <>
                                <button onClick={() => setReceiptSale(item)} className="p-2 rounded-lg bg-surface-2 dark:bg-surface-dark hover:bg-brand-500 hover:text-black transition-all" title="Ver Factura">🧾</button>
                                {!isPaid && (
                                  <button onClick={() => setPayModal(item)} className="px-5 py-2 rounded-lg bg-success text-white font-black text-[9px] uppercase tracking-widest shadow-sm hover:shadow-success/20 transition-all border-none cursor-pointer">Cobrar</button>
                                )}
                              </>
                            ) : (
                              <>
                                <button onClick={() => setPayDetail(item)} className="px-4 py-2 rounded-lg bg-surface-2 dark:bg-surface-dark text-content-subtle text-[9px] font-black uppercase tracking-widest hover:text-content hover:bg-surface-3 transition-all border-none cursor-pointer">Detalle</button>
                                {can("admin") && (
                                  <button onClick={() => removePayment(item.id)} className="p-2 rounded-lg bg-danger/5 text-danger border border-transparent hover:border-danger/20 hover:bg-danger hover:text-white transition-all" title="Eliminar Pago">🗑️</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal pago unificado */}
      {payModal && (
        <PaymentFormModal
          sale={payModal}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); loadPayments(); }}
        />
      )}

      {/* Modal detalle del pago */}
      {payDetail && (() => {
        const p = payDetail;
        const isBase = !p.currency_code || p.currency_code === baseCurrency?.code;
        const rate   = parseFloat(p.exchange_rate) || 1;
        const sym    = p.currency_symbol || baseCurrency?.symbol || "$";
        const fmtP   = n => `${sym}${(Number(n || 0) * (isBase ? 1 : rate)).toFixed(2)}`;
        const fmtB   = n => `${baseCurrency?.symbol || "$"}${Number(n || 0).toFixed(2)}`;
        const row    = (label, value, colorCls) => (
          <div className="flex justify-between mb-1.5 text-[13px]">
            <span className="text-content-muted dark:text-content-dark-muted">{label}</span>
            <span className={colorCls ? `${colorCls} font-bold` : "text-content dark:text-content-dark"}>{value}</span>
          </div>
        );
        return (
          <div onClick={() => setPayDetail(null)}
            className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-5">
            <div onClick={e => e.stopPropagation()}
              className="bg-surface-2 dark:bg-surface-dark-2 border border-success rounded-lg w-full max-w-[420px] font-mono shadow-[0_8px_40px_rgba(0,0,0,0.8)]">
              <div className="px-5 py-3.5 border-b border-border dark:border-border-dark flex justify-between items-center">
                <div className="font-bold text-[13px] text-success tracking-[2px]">DETALLE DEL PAGO</div>
                <button onClick={() => setPayDetail(null)}
                  className="bg-transparent border-none text-content-muted dark:text-content-dark-muted text-lg cursor-pointer">✕</button>
              </div>
              <div className="p-5">
                {row("Factura",    p.invoice_number || `#${p.sale_id}`, "text-brand-500")}
                {p.customer_name && row("Cliente", p.customer_name, "text-info")}
                {p.journal_name  && row("Diario",  p.journal_name)}
                <div className="border-t border-border dark:border-border-dark my-2.5" />
                {row("Monto cobrado", fmtP(p.amount), "text-success")}
                {!isBase && row("Equivalente USD", fmtB(p.amount), "text-content-muted dark:text-content-dark-muted")}
                {!isBase && row("Tasa del cobro", rate.toFixed(4), "text-content-muted dark:text-content-dark-muted")}
                <div className="border-t border-border dark:border-border-dark my-2.5" />
                {p.reference_number && row("N° Referencia", p.reference_number)}
                {p.reference_date   && row("Fecha referencia", new Date(p.reference_date + "T00:00:00").toLocaleDateString("es-VE"))}
                {row("Registrado el", new Date(p.created_at).toLocaleString("es-VE"))}
                {p.notes && row("Notas", p.notes)}
                <button 
                  onClick={() => setPayDetail(null)}
                  className="w-full mt-6 py-3 rounded-xl bg-surface-3 dark:bg-surface-dark-3 text-content-muted dark:text-content-dark-muted font-black text-[10px] uppercase tracking-[2px] hover:text-content transition-all border border-border dark:border-border-dark"
                >
                  Cerrar Detalle
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
