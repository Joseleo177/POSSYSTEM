import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";
import ReturnModal from "../ReturnModal";

export default function TransaccionesTab({ 
  notify, can, baseCurrency, allSeries, fmtPrice, fmtSale, setReceiptSale 
}) {
  const [sales,          setSales]          = useState([]);
  const [histDateFrom,   setHistDateFrom]   = useState("");
  const [histDateTo,     setHistDateTo]     = useState("");
  const [searchTerm,     setSearchTerm]     = useState("");
  const [activeFilters,  setActiveFilters]  = useState([]); // pendiente, parcial, pagado, anulado
  const [activeSeries,   setActiveSeries]   = useState([]); // array de IDs
  const [groupBy,        setGroupBy]        = useState(null); // cliente, fecha, serie
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [showGroupDrop,  setShowGroupDrop]  = useState(false);
  const [saleDetail,     setSaleDetail]     = useState(null);
  const [returnSale,     setReturnSale]     = useState(null);

  const loadSales = useCallback(async () => {
    try {
      const params = {};
      if (histDateFrom)  params.date_from = histDateFrom;
      if (histDateTo)    params.date_to   = histDateTo;
      // Los otros filtros (estado, serie, búsqueda) los haremos localmente para mayor fluidez
      const r = await api.sales.getAll(params);
      setSales(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [histDateFrom, histDateTo, notify]);

  const filteredSales = sales.filter(s => {
    const search = searchTerm.toLowerCase();
    const target = (s.invoice_number || "") + " " + (s.customer_name || "") + " " + (s.customer_rif || "");
    const matchesSearch = !searchTerm || target.toLowerCase().includes(search);
    if (!matchesSearch) return false;

    if (activeFilters.length > 0) {
      if (!activeFilters.includes(s.status)) return false;
    }

    if (activeSeries.length > 0) {
      if (!activeSeries.includes(s.serie_id)) return false;
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
      if (groupBy === 'serie')   key = item.serie_name || 'Sin serie';
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).map(([key, items]) => ({ key, items }));
  };

  const toggleFilter = (id) => {
    setActiveFilters(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSerie = (id) => {
    setActiveSeries(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  useEffect(() => { loadSales(); }, [loadSales]);

  const cancelSale = async (id) => {
    if (!confirm("¿Anular esta venta? Se restaurará el stock.")) return;
    try { await api.sales.cancel(id); notify("Venta anulada ✓"); loadSales(); }
    catch (e) { notify(e.message, "err"); }
  };

  const handleExportCSV = () => {
    const headers = ['Factura', 'Fecha', 'Cliente', 'RIF', 'Estado', 'Serie', 'Total', 'Abonado', 'Pendiente'];
    const rows = filteredSales.map(s => [
      s.invoice_number || s.id,
      new Date(s.created_at).toLocaleDateString(),
      s.customer_name || 'Sin Cliente',
      s.customer_rif || '',
      s.status,
      s.serie_name || '',
      s.total,
      s.amount_paid,
      s.balance
    ]);
    exportToCSV('Historial_Ventas', rows, headers);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── BARRA DE BÚSQUEDA Y FILTROS (ODOO STYLE) ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 print-hidden">
        <div className="relative flex-1 group w-full lg:max-w-xl">
          <input 
            type="text" 
            placeholder="Buscar por factura, cliente o RIF..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl text-xs font-bold text-content dark:text-content-dark placeholder:text-content-subtle placeholder:font-medium focus:ring-4 focus:ring-brand-500/10 shadow-sm transition-all outline-none"
          />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base lg:text-lg opacity-40 group-focus-within:opacity-100 group-focus-within:text-brand-500 transition-all">🔍</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <button 
              onClick={() => { setShowFilterDrop(!showFilterDrop); setShowGroupDrop(false); }}
              className={[
                "w-full sm:w-auto px-6 py-4 bg-white dark:bg-surface-dark-2 border rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
                (activeFilters.length > 0 || activeSeries.length > 0 || histDateFrom || histDateTo)
                  ? "border-brand-500 text-brand-500 bg-brand-500/5 shadow-md" 
                  : "border-border dark:border-border-dark text-content-subtle hover:text-content"
              ].join(" ")}
            >
              <span>⚙️ Filtros</span>
              <span className={`transition-transform duration-300 ${showFilterDrop ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {showFilterDrop && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-2xl z-[70] p-6 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 bg-surface-2/30 dark:bg-surface-dark-3/30 border-b border-border/50">
                    <div className="text-[8px] font-black uppercase tracking-widest text-content-subtle mb-3">Estados de Factura</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'pendiente', label: 'Pendiente', color: 'danger' },
                        { id: 'parcial', label: 'Parcial', color: 'brand-400' },
                        { id: 'pagado', label: 'Pagado', color: 'success' },
                        { id: 'anulado', label: 'Anulado', color: 'content-subtle' },
                      ].map(f => (
                        <button 
                          key={f.id}
                          onClick={() => toggleFilter(f.id)}
                          className={[
                            "px-2 py-1.5 rounded-lg text-[9px] font-bold border transition-all uppercase tracking-tight",
                            activeFilters.includes(f.id)
                              ? `bg-${f.color} text-white border-${f.color}`
                              : "bg-white dark:bg-surface-dark text-content-muted border-border dark:border-border-dark hover:border-brand-500/40"
                          ].join(" ")}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {allSeries.length > 0 && (
                    <div className="p-4 border-b border-border/50">
                      <div className="text-[8px] font-black uppercase tracking-widest text-content-subtle mb-3">Por Serie</div>
                      <div className="flex flex-col gap-1">
                        {allSeries.map(s => (
                          <button 
                            key={s.id}
                            onClick={() => toggleSerie(s.id)}
                            className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-surface-2 dark:hover:bg-surface-dark-3 rounded-lg transition-colors border-none cursor-pointer"
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-content">{s.prefix} · {s.name}</span>
                            {activeSeries.includes(s.id) && <span className="text-brand-500 text-xs">✓</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 space-y-3 bg-surface-2/30 dark:bg-surface-dark-3/30">
                    <div className="text-[8px] font-black uppercase tracking-widest text-content-subtle">Rango de Fecha</div>
                    <div className="flex flex-col gap-2">
                       <div className="flex flex-col gap-1">
                          <span className="text-[7px] font-bold uppercase text-content-subtle opacity-60 ml-1">Desde</span>
                          <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
                            className="w-full bg-white dark:bg-surface-dark border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-brand-500/20" />
                       </div>
                       <div className="flex flex-col gap-1">
                          <span className="text-[7px] font-bold uppercase text-content-subtle opacity-60 ml-1">Hasta</span>
                          <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
                            className="w-full bg-white dark:bg-surface-dark border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-brand-500/20" />
                       </div>
                    </div>
                    {(histDateFrom || histDateTo) && (
                      <button onClick={() => { setHistDateFrom(""); setHistDateTo(""); }}
                        className="w-full py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest text-danger hover:bg-danger/5 transition-colors border border-danger/20 cursor-pointer">
                        ✕ Limpiar Fechas
                      </button>
                    )}
                  </div>

                  <div className="p-2 bg-surface-3 dark:bg-surface-dark text-center">
                    <button 
                      onClick={() => { setActiveFilters([]); setActiveSeries([]); setHistDateFrom(""); setHistDateTo(""); setSearchTerm(""); setShowFilterDrop(false); }}
                      className="w-full py-2 rounded-lg text-[8px] font-black uppercase tracking-widest text-danger hover:bg-danger/5 transition-colors border-none cursor-pointer"
                    >
                      Limpiar Todo
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Agrupar por Dropdown */}
          <div className="relative flex-1 sm:flex-none">
            <button 
              onClick={() => { setShowGroupDrop(!showGroupDrop); setShowFilterDrop(false); }}
              className={[
                "w-full sm:w-auto px-6 py-4 bg-white dark:bg-surface-dark-2 border rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
                groupBy 
                  ? "border-info text-info bg-info/5 shadow-md" 
                  : "border-border dark:border-border-dark text-content-subtle hover:text-content"
              ].join(" ")}
            >
              <span>{groupBy ? `✓ Agrupado por ${groupBy}` : "📦 Agrupar por"}</span>
              <span className={`transition-transform duration-300 ${showGroupDrop ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {showGroupDrop && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowGroupDrop(false)} />
                <div className="absolute top-full right-0 mt-3 w-56 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {[
                    { id: 'cliente', label: 'Cliente', icon: '👤' },
                    { id: 'fecha', label: 'Fecha (Mes)', icon: '📅' },
                    { id: 'serie', label: 'Serie/Correlativo', icon: '🎫' },
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

          <div className="h-8 w-px bg-border/40 dark:bg-border-dark/40 shrink-0 hidden sm:block mx-1" />

          <button onClick={handleExportCSV} className="w-full sm:w-auto px-4 py-3 bg-surface-2 dark:bg-surface-dark-3 border border-border dark:border-border-dark rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-3 transition-all">
            <span>📥 CSV</span>
          </button>
          
          <button onClick={() => window.print()} className="w-full sm:w-auto px-4 py-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-500 hover:text-black transition-all">
            <span>🖨️ Imprimir</span>
          </button>
        </div>
      </div>


      {/* Lista ventas Premium Agrupada */}
      <div className="space-y-8">
        {filteredSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-surface-dark-2 rounded-2xl border border-dashed border-border dark:border-border-dark opacity-60">
            <div className="text-4xl mb-4">📄</div>
            <div className="text-xs font-black uppercase tracking-widest text-content-muted">Sin ventas registradas con estos filtros</div>
          </div>
        ) : (
          groupData(filteredSales).map(group => (
            <div key={group.key} className="animate-in fade-in duration-500">
              {groupBy && (
                <div className="flex items-center gap-3 mb-4 ml-2">
                  <div className="h-4 w-1 bg-brand-500 rounded-full" />
                  <span className="text-[11px] font-black uppercase tracking-[2px] text-content">{group.key}</span>
                  <span className="text-[10px] font-bold text-content-subtle">({group.items.length})</span>
                </div>
              )}
              
              <div className="space-y-4">
                {group.items.map(sale => (
                  <div 
                    key={sale.id} 
                    className="group bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl overflow-hidden hover:shadow-card-md transition-all duration-300"
                  >
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="flex flex-col shrink-0">
                          <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">Factura</span>
                          <span className="text-sm font-black text-content dark:text-content-dark">{sale.invoice_number || `#${sale.id}`}</span>
                        </div>
                        
                        <div className="hidden sm:block h-8 w-px bg-border/40 dark:bg-border-dark/40 shrink-0" />

                        <div className="flex flex-wrap items-center gap-2">
                          {sale.status === "pagado" ? (
                            <span className="px-3 py-1 rounded-full text-[9px] font-black bg-success/10 text-success border border-success/20 uppercase tracking-widest">PAGADO</span>
                          ) : sale.status === "parcial" ? (
                            <span className="px-3 py-1 rounded-full text-[9px] font-black bg-brand-500/10 text-brand-400 border border-brand-500/20 uppercase tracking-widest">PARCIAL</span>
                          ) : sale.status === "anulado" ? (
                            <span className="px-3 py-1 rounded-full text-[9px] font-black bg-content-subtle/10 text-content-subtle border border-content-subtle/20 uppercase tracking-widest">ANULADO</span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-[9px] font-black bg-danger/10 text-danger border border-danger/20 uppercase tracking-widest">PENDIENTE</span>
                          )}

                          {sale.journal_name && (
                            <span 
                              className="px-3 py-1 rounded-full text-[9px] font-black border uppercase tracking-widest flex items-center gap-1.5"
                              style={{ 
                                backgroundColor: (sale.journal_color || "#6366f1") + "10", 
                                color: sale.journal_color || "#6366f1",
                                borderColor: (sale.journal_color || "#6366f1") + "30"
                              }}
                            >
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: sale.journal_color || "#6366f1" }} />
                              <span className="truncate max-w-[80px] sm:max-w-none">{sale.journal_name}</span>
                            </span>
                          )}

                          {sale.customer_name && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-info bg-info/5 px-2.5 py-1 rounded-lg truncate max-w-[150px] sm:max-w-none">
                              👤 {sale.customer_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-2 md:mt-0 pt-4 md:pt-0 border-t md:border-none border-border/10">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest mb-1">{new Date(sale.created_at).toLocaleDateString()}</span>
                          <span className="text-lg font-black text-brand-400 tracking-tight">{fmtPrice(sale.total)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setSaleDetail(saleDetail?.id === sale.id ? null : sale)}
                            className={[
                              "px-4 md:px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border shadow-sm",
                              saleDetail?.id === sale.id
                                ? "bg-content text-white border-content shadow-content/20"
                                : "bg-surface-2 dark:bg-surface-dark-3 text-content dark:text-content-dark border-border dark:border-border-dark hover:border-brand-500/40"
                            ].join(" ")}
                          >
                            {saleDetail?.id === sale.id ? "Cerrar" : "Detalles"}
                          </button>
                          
                          <button 
                            onClick={() => setReceiptSale(sale)}
                            className="p-3.5 rounded-2xl bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all shadow-sm text-lg"
                            title="Ver Recibo"
                          >
                            🧾
                          </button>

                          {sale.status !== 'anulado' && (
                            <button
                              onClick={() => setReturnSale(sale)}
                              className="p-3.5 rounded-2xl bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-black transition-all shadow-sm text-lg"
                              title="Registrar Devolución Parcial/Total"
                            >
                              ↩️
                            </button>
                          )}

                          {can("admin") && sale.status !== 'anulado' && (
                            <button 
                              onClick={() => cancelSale(sale.id)} 
                              className="p-3.5 rounded-2xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm text-lg"
                              title="Anular Transacción"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {saleDetail?.id === sale.id && (
                      <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-300">
                        <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-[2.5rem] border border-border/40 overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] border-collapse min-w-[600px]">
                              <thead>
                                <tr className="bg-surface-3 dark:bg-surface-dark border-b border-border/40">
                                  <th className="text-left px-4 py-3 font-black text-content-subtle uppercase tracking-widest">Producto</th>
                                  <th className="text-center px-4 py-3 font-black text-content-subtle uppercase tracking-widest w-24">Cant.</th>
                                  <th className="text-right px-4 py-3 font-black text-content-subtle uppercase tracking-widest w-32">Precio Unit.</th>
                                  <th className="text-right px-4 py-3 font-black text-content-subtle uppercase tracking-widest w-32">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {sale.items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-brand-500/5 transition-colors">
                                    <td className="px-4 py-3 font-bold text-content">{item.name}</td>
                                    <td className="px-4 py-3 text-center font-bold text-content-muted">{item.quantity}</td>
                                    <td className="px-4 py-3 text-right font-bold text-content-muted">{fmtPrice(item.price)}</td>
                                    <td className="px-4 py-3 text-right font-black text-brand-400">
                                      {fmtPrice(item.subtotal ?? parseFloat(item.price || 0) * parseFloat(item.quantity || 1))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-surface-3/50 dark:bg-surface-dark/50 text-[10px]">
                                <tr>
                                  <td colSpan={3} className="px-4 py-3 text-right font-black text-content-subtle uppercase tracking-widest">Total Transacción</td>
                                  <td className="px-4 py-3 text-right font-black text-base text-brand-400 tracking-tight">{fmtPrice(sale.total)}</td>
                                </tr>
                                {sale.discount_amount > 0 && (
                                  <tr>
                                    <td colSpan={3} className="px-4 py-1 text-right font-bold text-danger uppercase tracking-widest">Descuento aplicado</td>
                                    <td className="px-4 py-1 text-right font-black text-danger">-{fmtPrice(sale.discount_amount)}</td>
                                  </tr>
                                )}
                                <tr>
                                  <td colSpan={3} className="px-4 py-1 text-right font-bold text-success uppercase tracking-widest">Monto Abonado</td>
                                  <td className="px-4 py-1 text-right font-black text-success">{fmtPrice(sale.amount_paid ?? 0)}</td>
                                </tr>
                                {sale.status !== 'pagado' && sale.status !== 'anulado' && (
                                  <tr className="border-t border-danger/10">
                                    <td colSpan={3} className="px-4 py-3 text-right font-black text-danger uppercase tracking-widest">Saldo Pendiente</td>
                                    <td className="px-4 py-3 text-right font-black text-base text-danger tracking-tight">{fmtPrice(sale.balance ?? 0)}</td>
                                  </tr>
                                ) || null}
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {returnSale && (
        <ReturnModal
          open={!!returnSale}
          onClose={() => setReturnSale(null)}
          sale={returnSale}
          onReturnSuccess={loadSales}
          notify={notify}
        />
      )}
    </div>
  );
}
