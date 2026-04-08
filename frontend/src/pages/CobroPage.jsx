import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";
import ReceiptModal from "../components/ReceiptModal";
import PaymentFormModal from "../components/PaymentFormModal";
import AperturaCajaModal from "../components/AperturaCajaModal";
import CierreCajaModal from "../components/CierreCajaModal";
import { fmtMoney } from "../helpers";
import { useDebounce } from "../hooks/useDebounce";
import ConfirmModal from "../components/ConfirmModal";

const fmt = fmtMoney;

export default function CobroPage() {
  const {
    notify, employee, baseCurrency, activeCurrencies, activeJournals,
    categories,
  } = useApp();

  const {
    cart, addToCart, removeFromCart, changeQty, setQtyDirect,
    subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
    discountPct, setDiscountPct, totalBase, totalDisplay,
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
  const debouncedSearch           = useDebounce(search, 300);

  const loadProducts = useCallback(async (q = "") => {
    if (!activeWarehouse) return;
    try {
      const r = await api.warehouses.getProducts(activeWarehouse.id, q ? { search: q } : {});
      setProducts(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [activeWarehouse, notify]);

  useEffect(() => { loadEmployeeWarehouses(); loadMySeries(); }, [loadEmployeeWarehouses, loadMySeries]);

  // Verificar sesión de caja
  useEffect(() => {
    if (!employee?.id || !activeWarehouse?.id) return;
    setCheckingSession(true);
    api.cashSessions.current({ employee_id: employee.id, warehouse_id: activeWarehouse.id })
      .then(r => {
        if (r.data) {
          setCashSession(r.data);
          setShowApertura(false);
        } else {
          setCashSession(null);
          setShowApertura(true);
        }
      })
      .catch(() => {
        setCashSession(null);
        setShowApertura(true);
      })
      .finally(() => setCheckingSession(false));
  }, [employee?.id, activeWarehouse?.id]);

  useEffect(() => { if (activeWarehouse) loadProducts(debouncedSearch); }, [activeWarehouse, debouncedSearch, loadProducts]);

  // ── Clientes ───────────────────────────────────────────────
  const [customers, setCustomers]         = useState([]);
  const [custSearch, setCustSearch]       = useState("");
  const debouncedCustSearch               = useDebounce(custSearch, 300);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [savingCustomer, setSavingCustomer]     = useState(false);

  useEffect(() => {
    if (!debouncedCustSearch.trim()) { setCustomers([]); return; }
    const t = async () => {
      try { 
        const r = await api.customers.getAll({ search: debouncedCustSearch }); 
        setCustomers(r.data.filter(c => c.type !== "proveedor")); 
      } catch {}
    };
    t();
  }, [debouncedCustSearch]);

  const saveCustomer = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSavingCustomer(true);
    try {
      const res = await api.customers.create(form);
      notify("Cliente registrado correctamente");
      if (customerEditData?._fromCobro && res?.data) {
        setSelectedCustomer(res.data);
        setCustSearch("");
      }
      setCustomerModal(false); setCustomerEditData(null);
    } catch (e) { notify(e.message, "err"); }
    setSavingCustomer(false);
  };

  const currSym  = currentCurrency?.symbol || baseCurrency?.symbol || "$";
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [cashSession,       setCashSession]       = useState(null);
  const [checkingSession,   setCheckingSession]   = useState(true);
  const [showApertura,      setShowApertura]      = useState(false);
  const [showCierre,        setShowCierre]        = useState(false);
  const [saleBalance,   setSaleBalance]   = useState(null);
  const [showPayModal,  setShowPayModal]  = useState(false);
  const [selectedCat,   setSelectedCat]   = useState("all");
  const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);

  if (employeeWarehouses.length === 0) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-10 animate-in fade-in duration-700">
      <div className="w-24 h-24 rounded-[40px] bg-surface-2 dark:bg-white/5 flex items-center justify-center text-brand-500 shadow-inner mb-6">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
      </div>
      <div className="font-black text-xl tracking-[4px] text-brand-500 uppercase">Sin Acceso a Almacén</div>
      <p className="text-sm text-content-subtle max-w-sm leading-relaxed font-medium">Tu usuario no tiene almacenes asignados.</p>
    </div>
  );

  const receiptRate    = parseFloat(receipt?.exchange_rate || 1);
  const receiptIsBase  = !receipt?.currency || receipt.currency.is_base;
  const receiptSym     = receiptIsBase ? (baseCurrency?.symbol || "$") : (receipt?.currency?.symbol || "$");
  const fmtSale        = (n) => fmt(receiptIsBase ? n : n * receiptRate, receiptSym);
  const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
  const currentStatus  = saleBalance?.status  ?? "pendiente";

  if (receipt) {
    const statusLabel = currentStatus === "pagado" ? "Completado" : currentStatus === "parcial" ? "Abono Parcial" : "Pendiente";
    const badgeClass = currentStatus === "pagado" ? "bg-green-500/10 text-green-500 border-green-500/20" : currentStatus === "parcial" ? "bg-brand-500/10 text-brand-500 border-brand-500/20" : "bg-danger/10 text-danger border-danger/20";

    return (
      <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-500">
        <div className="w-full max-w-[540px] bg-white dark:bg-surface-dark-2 rounded-[48px] p-10 shadow-2xl border border-white/20 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col items-center mb-10 relative text-center">
            <div className={`w-24 h-24 rounded-[32px] border-2 flex items-center justify-center mb-6 shadow-xl ${badgeClass}`}>
              {currentStatus === "pagado" ? (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 2" /></svg>
              )}
            </div>
            <div className="text-[10px] font-black uppercase tracking-[4px] text-content-subtle opacity-60 mb-2">Transacción Registrada</div>
            <h2 className="text-3xl font-black tracking-tight text-content dark:text-white font-display">Orden #{receipt.invoice_number || receipt.id}</h2>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-10 relative">
            <div className="bg-surface-1 dark:bg-white/5 p-6 rounded-[32px] border border-border/40 dark:border-white/5">
              <div className="text-[9px] font-black text-content-subtle uppercase tracking-[3px] mb-2 opacity-60">Importe Total</div>
              <div className="text-3xl font-black text-brand-500 tracking-tighter font-display tabular-nums">{fmtSale(receipt.total)}</div>
            </div>
            <div className="bg-surface-1 dark:bg-white/5 p-6 rounded-[32px] border border-border/40 dark:border-white/5">
              <div className="text-[9px] font-black text-content-subtle uppercase tracking-[3px] mb-2 opacity-60">Status</div>
              <div className={`text-[10px] font-black tracking-[2px] uppercase mt-1 px-4 py-2 rounded-full inline-block border ${badgeClass}`}>
                {statusLabel}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 relative">
            {currentStatus !== "pagado" && (
              <button onClick={() => setShowPayModal(true)} className="btn-primary !h-16 !rounded-[24px] !bg-green-500 hover:!bg-green-600 shadow-xl shadow-green-500/20 text-[11px] uppercase tracking-[3px]">
                Registrar Pago Inmediato
              </button>
            )}
            <div className="flex gap-4">
              <button onClick={() => setShowReceiptModal(true)} className="flex-1 h-14 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 text-content dark:text-white rounded-[24px] font-black text-[10px] uppercase tracking-[3px] hover:bg-surface-3 transition-all">Ver Ticket</button>
              <button onClick={() => { setReceipt(null); setSaleBalance(null); setShowPayModal(false); }} className="flex-1 h-14 bg-brand-500 text-brand-900 rounded-[24px] font-black text-[10px] uppercase tracking-[3px] hover:bg-brand-600 shadow-lg shadow-brand-500/20 transition-all">Siguiente</button>
            </div>
          </div>
        </div>
        <ReceiptModal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} sale={receipt} />
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
      </div>
    );
  }

  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase();
    const nameMatch = (p.name || "").toLowerCase().includes(s);
    const catMatch  = (p.category_name || "").toLowerCase().includes(s);
    const matchesSearch = nameMatch || catMatch;
    return matchesSearch && (selectedCat === "all" || p.category_name === selectedCat);
  });

  return (
    <div className="h-full flex flex-col lg:flex-row bg-[#f8f9fc] dark:bg-[#080808] text-content dark:text-content-dark overflow-hidden font-sans animate-in fade-in duration-1000">
      
      {/* ── Sidebar (Carrito) ── */}
      <aside className="w-full lg:w-[360px] lg:h-full bg-white dark:bg-[#0c0c0c] flex flex-col border-b lg:border-r border-border dark:border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.03)] z-20 shrink-0 order-2 lg:order-1 relative">
        <div className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden">

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              </div>
              <h2 className="text-[11px] font-black text-content dark:text-white tracking-[4px] uppercase leading-none">Checkout</h2>
            </div>
            {cashSession && (
              <button 
                onClick={() => setShowCierre(true)}
                className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-full cursor-pointer hover:bg-green-500/20 transition-all group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse group-hover:scale-125 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest text-green-500">Sesión Abierta</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
             <div className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 rounded-full border border-brand-500/20 overflow-hidden">
                <span className="text-xs text-brand-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-brand-500 truncate max-w-[150px]">{activeWarehouse?.name || "SIN ALMACÉN"}</span>
                {!cashSession && employeeWarehouses.length > 1 && (
                  <button onClick={() => setShowApertura(true)} className="ml-2 px-2 py-0.5 bg-brand-500 text-white rounded-md text-[8px] font-black hover:bg-brand-600 uppercase transition-colors">Cambiar</button>
                )}
             </div>
          </div>

          <div className="space-y-4 relative">
            <div className="relative group">
              {selectedCustomer ? (
                <div className="flex items-center justify-between h-10 px-4 bg-brand-500/10 border border-brand-500/20 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl text-brand-500">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-brand-500">Cliente</div>
                      <div className="text-sm font-black text-content dark:text-white truncate">{selectedCustomer.name}</div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCustomer(null)} className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center hover:bg-brand-500 hover:text-white transition-all shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <>
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="BUSCAR CLIENTE..." className="input !h-10 !pl-10 !bg-surface-1 dark:!bg-white/5 !rounded-xl !text-[10px] !font-black !tracking-[3px] !border-none dark:!text-white dark:placeholder-white/20" />
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-500 opacity-40">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <button onClick={() => { setCustomerEditData({ _fromCobro: true }); setCustomerModal(true); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-brand-500 text-white shadow-lg flex items-center justify-center text-xl font-bold">+</button>
                </>
              )}
              {!selectedCustomer && customers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-[28px] shadow-2xl z-[100] max-h-[300px] overflow-y-auto p-2">
                  {customers.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomers([]); setCustSearch(""); }} className="w-full text-left p-4 hover:bg-brand-500/10 rounded-[20px] transition-all group">
                      <div className="text-[11px] font-black dark:text-white truncate">{c.name}</div>
                      <div className="text-[9px] font-bold opacity-60 uppercase dark:text-content-dark-muted">{c.rif || "Sin Cédula/RIF"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1 bg-surface-1 dark:bg-white/5 rounded-2xl flex items-center px-4 gap-2 border border-black/5 dark:border-white/5">
                <span className="text-xs opacity-40">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                <select value={currentCurrency?.id || ""} onChange={e => setSelectedCurrency(activeCurrencies.find(x => x.id === parseInt(e.target.value)))} className="bg-transparent flex-1 h-9 text-[10px] font-black outline-none border-none p-0 dark:text-white">
                  {activeCurrencies.map(c => <option key={c.id} value={c.id} className="dark:bg-[#0c0c0c]">{c.code}</option>)}
                </select>
              </div>
              <div className="flex-1 bg-surface-1 dark:bg-white/5 rounded-2xl flex items-center px-4 gap-2 border border-black/5 dark:border-white/5">
                <span className="text-xs opacity-40">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </span>
                <select value={selectedSerieId || ""} onChange={e => selectSerie(parseInt(e.target.value))} className="bg-transparent flex-1 h-9 text-[10px] font-black outline-none border-none p-0 dark:text-white">
                  <option value="" disabled className="dark:bg-[#0c0c0c]">SERIE...</option>
                  {mySeries.map(s => <option key={s.id} value={s.id} className="dark:bg-[#0c0c0c]">{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide pt-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 py-8">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle opacity-20">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
                <div className="text-[10px] font-black tracking-[6px] uppercase text-center dark:text-white">Inicia una venta</div>
              </div>
            ) : (
              cart.map(i => (
                <div key={i.id} className="bg-surface-1 dark:bg-white/5 p-4 rounded-[28px] flex items-center gap-4 group transition-all">
                  <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/5 flex items-center justify-center text-xl shrink-0 overflow-hidden relative">
                    {i.image_url ? <img src={i.image_url} className="w-full h-full object-cover" /> : <div className="text-sm opacity-20 dark:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>}
                    <button onClick={() => removeFromCart(i.id)} className="absolute inset-0 bg-danger/80 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black truncate dark:text-white">{i.name}</div>
                    <div className="text-[10px] font-black text-brand-500 mt-1">{fmt(convertToDisplay(i.price), currSym)}</div>
                  </div>
                  <div className="flex items-center bg-surface-2 dark:bg-black/20 p-1 rounded-xl shadow-inner border border-black/5 dark:border-white/5">
                    <button onClick={() => changeQty(i.id, -1)} className="w-8 h-8 rounded-lg font-black dark:text-white">-</button>
                    <input
                      type="number"
                      step={["unidad", "kg", "litro", "metro"].includes(i.unit?.toLowerCase()) ? "1" : (i.qty_step || "0.01")}
                      value={i.qty}
                      onChange={e => setQtyDirect(i.id, e.target.value)}
                      className="w-12 bg-transparent text-center text-[11px] font-black border-none outline-none dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button onClick={() => changeQty(i.id, 1)} className="w-8 h-8 rounded-lg font-black dark:text-white">+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-border/10 space-y-2">
            <div className="bg-surface-1 dark:bg-white/5 rounded-xl p-3 flex items-center justify-between gap-3 border border-black/5 dark:border-white/5">
              <div className="flex items-center gap-3">
                <button onClick={() => setDiscountEnabled(!discountEnabled)} className={`w-10 h-6 rounded-full transition-all relative ${discountEnabled ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${discountEnabled ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 dark:text-content-dark-muted">Dto. Global</span>
              </div>
              {discountEnabled && (
                <div className="relative w-24">
                  <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="0" className="w-full bg-surface-2 dark:bg-white/10 h-8 rounded-lg px-3 text-right text-xs font-black outline-none focus:ring-2 focus:ring-brand-500/20 dark:text-white" />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black opacity-30 dark:text-white">%</span>
                </div>
              )}
            </div>
            <div className="bg-surface-1 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/10">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center opacity-60 dark:text-content-dark-muted">
                  <span className="text-[9px] font-black uppercase tracking-[3px]">SUBTOTAL</span>
                  <span className="text-xs font-black tracking-tight tabular-nums">{fmt(convertToDisplay(subtotalBase), currSym)}</span>
                </div>
                {discountEnabled && discountAmount > 0 && (
                  <div className="flex justify-between items-center text-brand-500">
                    <span className="text-[9px] font-black uppercase tracking-[3px]">DESC. ({discountPct}%)</span>
                    <span className="text-xs font-black tracking-tight tabular-nums">-{fmt(convertToDisplay(discountAmount), currSym)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-brand-500 uppercase tracking-[4px]">TOTAL</span>
                <div className="text-2xl font-black tracking-tighter tabular-nums font-display dark:text-white">{fmt(totalDisplay, currSym)}</div>
              </div>
            </div>
            <button onClick={() => setShowConfirmCheckout(true)} disabled={loading || cart.length === 0} className="w-full h-12 bg-brand-500 text-brand-900 rounded-2xl font-black uppercase tracking-[4px] shadow-xl shadow-brand-500/20 active:scale-95 transition-all text-sm">
              {loading ? "PROCESANDO..." : "FINALIZAR VENTA"}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-4 overflow-hidden order-1 lg:order-2">
        <div className="flex items-center gap-2 overflow-x-auto mb-3 pb-1 scrollbar-hide">
          <button onClick={() => setSelectedCat("all")} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[3px] border-2 transition-all whitespace-nowrap ${selectedCat === "all" ? "bg-brand-500 text-brand-900 border-brand-500" : "bg-white dark:bg-white/5 border-transparent dark:text-white"}`}>TODOS</button>
          {categories.map(cat => <button key={cat.id} onClick={() => setSelectedCat(cat.name)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[3px] border-2 transition-all whitespace-nowrap ${selectedCat === cat.name ? "bg-brand-500 text-brand-900 border-brand-500" : "bg-white dark:bg-white/5 border-transparent dark:text-white"}`}>{cat.name}</button>)}
        </div>
        <div className="relative mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="BUSCAR PRODUCTO..." className="w-full bg-white dark:bg-surface-dark-2 h-10 px-10 rounded-xl text-xs font-black tracking-[2px] outline-none shadow dark:text-white dark:placeholder-white/20" />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500 opacity-40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-hide">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredProducts.map(p => {
              const outOfStock = !p.is_service && (p.stock ?? 0) <= 0;
              return (
                <div key={p.id}
                  onClick={() => !outOfStock && addToCart(p)}
                  className={`group bg-white dark:bg-surface-dark-2 rounded-2xl overflow-hidden transition-all shadow border-2 border-transparent
                    ${outOfStock ? "opacity-40 cursor-not-allowed" : "hover:-translate-y-1 cursor-pointer hover:border-brand-500/50"}`}
                >
                  <div className="aspect-square bg-surface-1 dark:bg-white/5 relative overflow-hidden">
                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center opacity-10 dark:text-white"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-black/60 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">Sin stock</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex flex-col gap-0.5">
                    <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{p.category_name || "Sin Categoría"}</div>
                    <div className="text-xs font-black truncate dark:text-white uppercase tracking-wider">{p.name}</div>
                    <div className="text-base font-black mt-1 dark:text-white font-display">{fmt(convertToDisplay(p.price), currSym)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <CustomerModal open={customerModal} onClose={() => setCustomerModal(false)} onSave={saveCustomer} />
      {showApertura && (
        <AperturaCajaModal 
          employee={employee} 
          warehouses={employeeWarehouses} 
          initialWarehouse={activeWarehouse} 
          onOpened={(session) => { setCashSession(session); setShowApertura(false); }} 
        />
      )}
      <ConfirmModal isOpen={showConfirmCheckout} title="Venta" message="¿Realizar cobro?" onConfirm={() => { setShowConfirmCheckout(false); checkout(); }} onCancel={() => setShowConfirmCheckout(false)} />

      {showCierre && cashSession && (
        <CierreCajaModal 
          session={cashSession} 
          onClosed={() => { setCashSession(null); setShowCierre(false); setShowApertura(true); }} 
          onCancel={() => setShowCierre(false)} 
        />
      )}
    </div>
  );
}
