import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";
import ReceiptModal from "../components/ReceiptModal";
import PaymentFormModal from "../components/PaymentFormModal";

const fmt = (n, symbol = "$") => `${symbol}${Number(n).toFixed(2)}`;

export default function CobroPage() {
  const {
    notify, baseCurrency, activeCurrencies, activeJournals,
    categories,
  } = useApp();

  const {
    cart, addToCart, removeFromCart, changeQty, setQtyDirect,
    totalBase, totalDisplay,
    currentCurrency, setSelectedCurrency, exchangeRate,
    convertToDisplay,
    selectedSerieId, selectSerie, mySeries, loadMySeries,
    selectedCustomer, setSelectedCustomer,
    employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
    checkout, loading, receipt, setReceipt,
  } = useCart();

  // ── Productos ──────────────────────────────────────────────
  const [products, setProducts]   = useState([]);
  const [search, setSearch]       = useState("");

  const loadProducts = useCallback(async (q = "") => {
    if (!activeWarehouse) return;
    try {
      const r = await api.warehouses.getProducts(activeWarehouse.id, q ? { search: q } : {});
      setProducts(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [activeWarehouse, notify]);

  useEffect(() => { loadEmployeeWarehouses(); loadMySeries(); }, [loadEmployeeWarehouses, loadMySeries]);
  useEffect(() => { if (activeWarehouse) loadProducts(search); }, [activeWarehouse, search, loadProducts]);

  // ── Clientes ───────────────────────────────────────────────
  const [customers, setCustomers]         = useState([]);
  const [custSearch, setCustSearch]       = useState("");
  const [customerModal, setCustomerModal] = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [savingCustomer, setSavingCustomer]     = useState(false);

  useEffect(() => {
    if (!custSearch.trim()) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      try { 
        const r = await api.customers.getAll({ search: custSearch }); 
        setCustomers(r.data.filter(c => c.type !== "proveedor")); 
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch]);

  const saveCustomer = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSavingCustomer(true);
    try {
      const res = await api.customers.create(form);
      notify("Cliente registrado ✓");
      if (customerEditData?._fromCobro && res?.data) {
        setSelectedCustomer(res.data);
        setCustSearch("");
      }
      setCustomerModal(false); setCustomerEditData(null);
    } catch (e) { notify(e.message, "err"); }
    setSavingCustomer(false);
  };

  const currSym  = currentCurrency?.symbol || baseCurrency?.symbol || "$";
  const fmtPrice = (n) => fmt(n, baseCurrency?.symbol || "$");

  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // ── Pago inmediato tras generar factura ───────────────────
  const [saleBalance,   setSaleBalance]   = useState(null); // { amount_paid, balance, status }
  const [showPayModal,  setShowPayModal]  = useState(false);
  const [selectedCat,   setSelectedCat]   = useState("all");

  // ── Sin almacén asignado ───────────────────────────────────
  if (employeeWarehouses.length === 0) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="text-5xl">🏪</div>
      <div className="font-bold text-base tracking-widest text-brand-400">SIN ALMACÉN ASIGNADO</div>
      <div className="text-xs text-content-muted dark:text-content dark:text-content-dark-muted max-w-sm leading-relaxed">
        No tienes ningún almacén asignado.<br/>
        Pide al administrador que te asigne uno en<br/>
        <b className="text-content dark:text-content dark:text-content-dark">Inventario → Almacenes → Empleados</b>
      </div>
    </div>
  );

  // ── Helpers de moneda del receipt ─────────────────────────
  const receiptRate    = parseFloat(receipt?.exchange_rate || 1);
  const receiptIsBase  = !receipt?.currency || receipt.currency.is_base;
  const receiptSym     = receiptIsBase ? (baseCurrency?.symbol || "$") : (receipt?.currency?.symbol || "$");
  const fmtSale        = (n) => fmt(receiptIsBase ? n : n * receiptRate, receiptSym);
  const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
  const currentStatus  = saleBalance?.status  ?? "pendiente";

  // ── Receipt View (Post-Checkout) ───────────────────────────
  if (receipt) {
    const statusClasses = currentStatus === "pagado" ? "text-success" : currentStatus === "parcial" ? "text-brand-400" : "text-danger";
    const statusLabel = currentStatus === "pagado" ? "PAGADO" : currentStatus === "parcial" ? "PARCIAL" : "PENDIENTE";
    const badgeClass = currentStatus === "pagado" ? "bg-success/20 text-success" : currentStatus === "parcial" ? "bg-brand-500/20 text-brand-400" : "bg-danger/20 text-danger";

    return (
      <div className="fixed inset-0 z-[100] bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="w-full max-w-[500px] bg-surface-2 dark:bg-surface-dark-2 border border-border/40 rounded-3xl p-8 shadow-2xl text-content dark:text-content-dark">
          <div className="flex flex-col items-center mb-8">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 ${badgeClass}`}>
              {currentStatus === "pagado" ? "✓" : "📄"}
            </div>
            <div className="text-[10px] font-black uppercase tracking-[3px] text-content-subtle mb-1">VENTA REGISTRADA</div>
            <div className="text-2xl font-black tracking-tight">#{receipt.invoice_number || receipt.id}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-surface-3 dark:bg-surface-dark-3 p-4 rounded-2xl border border-border/10">
              <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1">TOTAL</div>
              <div className="text-2xl font-black text-brand-400 tracking-tight">{fmtSale(receipt.total)}</div>
            </div>
            <div className="bg-surface-3 dark:bg-surface-dark-3 p-4 rounded-2xl border border-border/10">
              <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1">ESTADO</div>
              <div className={`text-sm font-black tracking-widest uppercase mt-1 ${statusClasses}`}>{statusLabel}</div>
            </div>
          </div>

          {currentStatus === "parcial" && saleBalance && (
            <div className="bg-brand-500/5 border border-brand-500/20 rounded-2xl p-4 mb-6 flex justify-between items-center">
              <div>
                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-0.5 text-brand-400/70">DEUDA PENDIENTE</div>
                <div className="text-xl font-black text-brand-400">{fmtSale(saleBalance.balance)}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-0.5 opacity-60">PAGADO</div>
                <div className="text-sm font-black text-success">{fmtSale(saleBalance.amount_paid)}</div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {currentStatus !== "pagado" && (
              <button onClick={() => setShowPayModal(true)} className="w-full py-4 bg-success text-white rounded-2xl font-black text-sm uppercase tracking-[2px] shadow-lg shadow-success/20 hover:scale-[1.02] active:scale-100 transition-all cursor-pointer">
                Registrar Pago
              </button>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowReceiptModal(true)} className="flex-1 py-4 bg-surface-3 dark:bg-surface-dark-3 border border-border/20 text-content dark:text-content-dark rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:bg-surface-dark-4 transition-all cursor-pointer">
                Ver Factura
              </button>
              <button onClick={() => { setReceipt(null); setSaleBalance(null); setShowPayModal(false); }} className="flex-1 py-4 bg-brand-500 text-black rounded-2xl font-black text-[10px] uppercase tracking-[2px] hover:scale-[1.02] active:scale-100 transition-all cursor-pointer">
                Nueva Venta
              </button>
            </div>
          </div>
        </div>

        {showPayModal && receipt && (
          <PaymentFormModal
            sale={{ ...receipt, balance: currentBalance, amount_paid: saleBalance?.amount_paid ?? 0 }}
            onClose={() => setShowPayModal(false)}
            onSuccess={(res) => {
              setSaleBalance({ amount_paid: res.amount_paid, balance: res.balance, status: res.sale_status });
              setShowPayModal(false);
            }}
          />
        )}
        <ReceiptModal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} sale={receipt} />
      </div>
    );
  }

  // ── Main POS Interface ─────────────────────────────────────

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.category_name?.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCat === "all" || p.category_name === selectedCat;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="min-h-[calc(100vh-68px)] lg:h-[calc(100vh-68px)] flex flex-col lg:flex-row bg-surface dark:bg-[#0a0a0a] text-content dark:text-content-dark overflow-x-hidden font-sans">
      
      {/* ── Sidebar (Carrito) ── */}
      <aside className="w-full lg:w-[420px] lg:h-full bg-white dark:bg-[#121212] flex flex-col border-b lg:border-r border-border dark:border-white/5 shadow-2xl shrink-0 order-2 lg:order-1">
        <div className="p-6 border-b border-border dark:border-white/5 flex flex-col gap-4 text-content dark:text-content-dark">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-content-subtle tracking-[3px] uppercase">Orden Actual</h2>
            <select
              value={currentCurrency?.id || ""}
              onChange={e => { const c = activeCurrencies.find(x => x.id === parseInt(e.target.value)); setSelectedCurrency(c?.is_base ? null : c || null); }}
              className="bg-surface-2 dark:bg-[#1a1a1a] border border-border dark:border-white/10 text-brand-400 px-3 py-1.5 rounded-xl text-[10px] font-black focus:outline-none appearance-none cursor-pointer"
            >
              {activeCurrencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
            </select>
          </div>

          {/* Cliente selector premium */}
          <div className="relative group">
            {selectedCustomer ? (
              <div className="flex items-center gap-3 bg-info/10 border border-info/30 p-3 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-info/20 text-info flex items-center justify-center font-black">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-info leading-none mb-1 uppercase tracking-tight truncate">{selectedCustomer.name}</div>
                  <div className="text-[9px] text-content-subtle font-bold tracking-widest">{selectedCustomer.rif || "SIN IDENTIFICACIÓN"}</div>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustSearch(""); }} className="text-danger opacity-60 hover:opacity-100 transition-opacity p-2 cursor-pointer">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={custSearch}
                  onChange={e => setCustSearch(e.target.value)}
                  placeholder="IDENTIFICAR CLIENTE..."
                  className="w-full bg-surface-2 dark:bg-[#1a1a1a] border-none text-[10px] font-black tracking-widest placeholder:text-content-subtle/50 py-4 px-5 rounded-2xl outline-none focus:ring-2 focus:ring-info/20 transition-all"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-30 text-lg pointer-events-none">👤</div>
                {custSearch.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-[#1a1a1a] border border-border dark:border-white/10 rounded-2xl mt-2 z-[100] max-h-[300px] overflow-y-auto shadow-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {customers.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustSearch(""); }} className="p-3 rounded-xl hover:bg-surface dark:hover:bg-white/5 cursor-pointer border-b border-border dark:border-white/5 last:border-0 transition-colors">
                        <div className="text-xs font-black text-content dark:text-content-dark mb-1">{c.name}</div>
                        <div className="text-[9px] text-content-subtle tracking-widest uppercase font-bold">{c.rif || "Sin RIF"}</div>
                      </div>
                    ))}
                    <button onClick={() => { setCustomerEditData({ _newType: "cliente", _newName: custSearch, _fromCobro: true }); setCustomerModal(true); setCustSearch(""); }} className="w-full p-3 rounded-xl bg-info/10 text-info text-[10px] font-black uppercase tracking-widest mt-2 hover:bg-info/20 transition-all text-left cursor-pointer">
                      + CREAR CLIENTE: "{custSearch}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {!selectedSerieId && mySeries.length > 0 && (
            <div className="flex gap-2 p-1 bg-danger/5 border border-danger/20 rounded-xl">
              {mySeries.map(s => (
                <button key={s.id} onClick={() => selectSerie(s.id)} className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border border-danger/30 text-danger rounded-lg hover:bg-danger/10 transition-all cursor-pointer">
                  SERIE: {s.prefix}
                </button>
              ))}
            </div>
          )}
          {selectedSerieId && (
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[#555] px-2 leading-none">
              <span>Fiscal Activa: {mySeries.find(s => s.id === selectedSerieId)?.prefix}</span>
              <button onClick={() => selectSerie(null)} className="text-info underline hover:text-white dark:hover:text-white transition-colors cursor-pointer">CAMBIAR</button>
            </div>
          )}
        </div>

        {/* Lista de carrito */}
        <div className="flex-1 overflow-y-auto max-h-[400px] lg:max-h-none p-4 flex flex-col gap-2 scrollbar-dark">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-20 text-content dark:text-content-dark">
              <div className="text-6xl mb-4">🛒</div>
              <div className="text-[10px] font-black uppercase tracking-[3px]">CARRITO VACÍO</div>
            </div>
          ) : cart.map(i => (
            <div key={i.id} className="group bg-surface-2 dark:bg-[#1a1a1a] rounded-2xl p-3 flex items-center gap-3 border border-transparent hover:border-border dark:border-white/10 transition-all text-content dark:text-content-dark">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black text-content dark:text-content-dark uppercase tracking-tight leading-none mb-1.5 truncate">{i.name}</div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-content-subtle">
                  <span>{fmt(convertToDisplay(i.price), currSym)}</span>
                  <span className="opacity-20">/</span>
                  <span className="uppercase text-[9px]">{i.unit || "und"}</span>
                </div>
              </div>
              
              <div className="flex items-center bg-black/30 p-1 rounded-xl">
                <button onClick={() => changeQty(i.id, -1, products)} className="w-8 h-8 flex items-center justify-center text-lg hover:text-danger rounded-lg transition-all cursor-pointer">−</button>
                <div className="w-10 text-center text-xs font-black text-brand-400">{i.qty}</div>
                <button onClick={() => changeQty(i.id, 1, products)} className="w-8 h-8 flex items-center justify-center text-lg hover:text-success rounded-lg transition-all cursor-pointer">+</button>
              </div>

              <div className="min-w-[70px] text-right">
                <div className="text-sm font-black text-brand-400 tracking-tight">
                  {fmt(convertToDisplay(parseFloat(i.price) * i.qty), currSym)}
                </div>
              </div>

              <button onClick={() => removeFromCart(i.id)} className="w-8 h-8 rounded-xl flex items-center justify-center text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/20 transition-all cursor-pointer">✕</button>
            </div>
          ))}
        </div>

        {/* Totales y Footer Checkout */}
        <div className="p-6 bg-surface-2 dark:bg-black/40 border-t border-border dark:border-white/5 text-content dark:text-content-dark sticky bottom-0">
          <div className="flex justify-between items-end mb-6">
            <div className="text-[10px] font-black text-content-subtle tracking-[2px] uppercase mb-1">Monto a cobrar</div>
            <div className="text-right">
              <div className="text-4xl font-black text-brand-400 tracking-tight leading-none">{fmt(totalDisplay, currSym)}</div>
              {currentCurrency && !currentCurrency.is_base && (
                <div className="text-[10px] font-black text-success mt-1 uppercase tracking-widest leading-none">{fmtPrice(totalBase)} {baseCurrency?.code}</div>
              )}
            </div>
          </div>

          <button
            onClick={() => checkout(() => loadProducts())}
            disabled={loading || !activeWarehouse || !selectedCustomer || !selectedSerieId || cart.length === 0}
            className={`w-full py-6 rounded-[24px] text-sm font-black tracking-[4px] uppercase transition-all duration-300 shadow-2xl flex items-center justify-center gap-3 cursor-pointer
              ${loading || !activeWarehouse || !selectedCustomer || !selectedSerieId || cart.length === 0
                ? "bg-surface-3 dark:bg-surface-dark-3 text-content-muted cursor-not-allowed opacity-50"
                : "bg-brand-500 text-brand-800 hover:bg-brand-600 hover:scale-[1.02] shadow-brand-500/20 active:scale-100"
              }`}
          >
            {loading ? "PROCESANDO..." : "COBRAR ORDEN"}
          </button>
        </div>
      </aside>

      {/* ── Área Principal (Productos) ── */}
      <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden order-1 lg:order-2">
        
        {/* Top: Categorías + Warehouse */}
        <div className="flex items-center gap-4 mb-6 text-content dark:text-content-dark">
          <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button 
              onClick={() => setSelectedCat("all")}
              className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap cursor-pointer
                ${selectedCat === "all" ? "bg-brand-500 text-black shadow-lg" : "bg-surface-2 dark:bg-surface-dark-2 text-content-subtle border border-border dark:border-white/5 hover:bg-surface dark:hover:bg-white/5"}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button 
                key={cat.id}
                onClick={() => setSelectedCat(cat.name)}
                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[2px] transition-all whitespace-nowrap cursor-pointer
                  ${selectedCat === cat.name ? "bg-brand-500 text-black shadow-lg" : "bg-surface-2 dark:bg-surface-dark-2 text-content-subtle border border-border dark:border-white/5 hover:bg-surface dark:hover:bg-white/5"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2 shrink-0">
            {employeeWarehouses.map(w => (
              <button key={w.id} onClick={() => switchWarehouse(w)} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all border cursor-pointer
                ${activeWarehouse?.id === w.id ? "bg-info text-white border-info shadow-lg" : "bg-surface-2 dark:bg-surface-dark-2 text-content-subtle border-border dark:border-white/5 hover:bg-surface dark:hover:bg-white/5"}`}>
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 text-content dark:text-content-dark">
          <input 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="BUSCAR PRODUCTO O SCANNER BARCODE..."
            className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-white/5 text-content dark:text-content-dark py-4 px-12 rounded-2xl text-[11px] font-black tracking-widest outline-none focus:ring-2 focus:ring-brand-500/20 transition-all placeholder:text-content-subtle/30"
          />
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-xl opacity-30 pointer-events-none">🔍</div>
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto scrollbar-dark pr-2 pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6">
            {filteredProducts.map(p => {
              const inStock = parseFloat(p.stock) > 0 && activeWarehouse;
              return (
                <div key={p.id} onClick={() => inStock && addToCart(p)}
                  className={`group bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[32px] overflow-hidden transition-all duration-300 flex flex-col text-content dark:text-content-dark
                    ${inStock ? "cursor-pointer hover:border-brand-500/50 hover:shadow-2xl hover:bg-surface-3 dark:bg-surface-dark-3 hover:-translate-y-1" : "opacity-30 grayscale cursor-not-allowed"}`}>
                  
                  <div className="relative aspect-square overflow-hidden bg-black/20">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl opacity-10 font-black">📦</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-4 left-5 right-5">
                      <div className="text-[9px] font-black text-brand-400 uppercase tracking-[2px] mb-1 leading-none">{p.category_name || "GENERAL"}</div>
                      <div className="text-xs font-black text-white uppercase tracking-tight leading-tight line-clamp-2">{p.name}</div>
                    </div>
                  </div>

                  <div className="p-5 flex items-center justify-between mt-auto">
                    <div className="text-lg font-black text-brand-400 tracking-tight leading-none">{fmt(convertToDisplay(p.price), currSym)}</div>
                    <div className={`text-[10px] font-black px-2.5 py-1.5 rounded-xl uppercase tracking-widest leading-none ${parseFloat(p.stock) <= 5 ? "bg-brand-500/20 text-brand-400 animate-pulse" : "bg-white/5 text-content-subtle"}`}>
                      {p.stock} {p.unit || "und"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <CustomerModal
        open={customerModal}
        onClose={() => { setCustomerModal(false); setCustomerEditData(null); }}
        onSave={saveCustomer}
        editData={customerEditData}
        loading={savingCustomer}
      />
    </div>
  );
}
