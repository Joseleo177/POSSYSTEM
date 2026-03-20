import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";
import ReceiptModal from "../components/ReceiptModal";
import PaymentFormModal from "../components/PaymentFormModal";

const fmt = (n, symbol = "$") => `${symbol}${Number(n).toFixed(2)}`;

const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

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

 // ✅ Ahora:
const loadProducts = useCallback(async (q = "") => {
  if (!activeWarehouse) return;
  try {
    const r = await api.warehouses.getProducts(activeWarehouse.id, q ? { search: q } : {});
    setProducts(r.data);
  } catch (e) { notify(e.message, "err"); }
}, [activeWarehouse]);

useEffect(() => { loadEmployeeWarehouses(); loadMySeries(); }, []);
useEffect(() => { if (activeWarehouse) loadProducts(search); }, [activeWarehouse, search]);

  // ── Clientes ───────────────────────────────────────────────
  const [customers, setCustomers]         = useState([]);
  const [custSearch, setCustSearch]       = useState("");
  const [customerModal, setCustomerModal] = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [savingCustomer, setSavingCustomer]     = useState(false);

  useEffect(() => {
    if (!custSearch.trim()) { setCustomers([]); return; }
    const t = setTimeout(async () => {
      try { const r = await api.customers.getAll({ search: custSearch }); setCustomers(r.data.filter(c => c.type !== "proveedor")); }
      catch {}
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

  // ── Sin almacén asignado ───────────────────────────────────
  if (employeeWarehouses.length === 0) return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16,textAlign:"center" }}>
      <div style={{ fontSize:48 }}>🏪</div>
      <div style={{ fontWeight:"bold",fontSize:16,color:"#f0a500",letterSpacing:2 }}>SIN ALMACÉN ASIGNADO</div>
      <div style={{ fontSize:13,color:"#555",maxWidth:400,lineHeight:1.8 }}>
        No tienes ningún almacén asignado.<br/>
        Pide al administrador que te asigne uno en<br/>
        <b style={{ color:"#e8e0d0" }}>Inventario → Almacenes → Empleados</b>
      </div>
    </div>
  );

  // ── Helpers de moneda del receipt ─────────────────────────
  const receiptRate    = parseFloat(receipt?.exchange_rate || 1);
  const receiptIsBase  = !receipt?.currency || receipt.currency.is_base;
  const receiptSym     = receiptIsBase ? (baseCurrency?.symbol || "$") : (receipt?.currency?.symbol || "Bs.");
  const fmtSale        = (n) => fmt(receiptIsBase ? n : n * receiptRate, receiptSym);
  const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
  const currentStatus  = saleBalance?.status  ?? "pendiente";


  // ── Receipt ────────────────────────────────────────────────
  if (receipt) {
    const statusColor = currentStatus === 'pagado' ? "#27ae60" : currentStatus === 'parcial' ? "#f0a500" : "#e74c3c";
    const statusLabel = currentStatus === 'pagado' ? "PAGADO" : currentStatus === 'parcial' ? "PARCIAL" : "PENDIENTE";

    return (
    <div style={{ maxWidth:460,margin:"0 auto" }}>
      {/* Cabecera */}
      <div style={{ background:"#1a1a1a",border:`1px solid ${statusColor}`,borderRadius:6,padding:"16px 20px",marginBottom:12,display:"flex",alignItems:"center",gap:12 }}>
        <div style={{ fontSize:24 }}>{currentStatus === 'pagado' ? "✓" : "📄"}</div>
        <div>
          <div style={{ color:statusColor,fontWeight:"bold",fontSize:14,letterSpacing:2 }}>FACTURA {receipt.invoice_number || `#${receipt.id}`}</div>
          <div style={{ fontSize:11,color:"#555" }}>{new Date(receipt.created_at).toLocaleString("es-VE")}</div>
          {receipt.customerName && <div style={{ fontSize:12,color:"#5dade2",marginTop:2 }}>👤 {receipt.customerName}</div>}
        </div>
        <div style={{ marginLeft:"auto",textAlign:"right" }}>
          <div style={{ fontSize:18,fontWeight:"bold",color:"#f0a500" }}>{fmtSale(receipt.total)}</div>
          {!receiptIsBase && <div style={{ fontSize:10,color:"#555" }}>{fmtPrice(receipt.total)} {baseCurrency?.code}</div>}
          <span style={{ fontSize:10,background:statusColor+"22",color:statusColor,border:`1px solid ${statusColor}44`,padding:"1px 7px",borderRadius:3,letterSpacing:1 }}>{statusLabel}</span>
        </div>
      </div>

      {/* Balance si es parcial */}
      {currentStatus === 'parcial' && saleBalance && (
        <div style={{ background:"#1a1a1a",border:"1px solid #f0a50044",borderRadius:6,padding:"10px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",fontSize:12 }}>
          <div>
            <div style={{ color:"#555",fontSize:10,marginBottom:2 }}>PAGADO</div>
            <div style={{ color:"#27ae60",fontWeight:"bold" }}>{fmtSale(saleBalance.amount_paid)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#555",fontSize:10,marginBottom:2 }}>SALDO PENDIENTE</div>
            <div style={{ color:"#e74c3c",fontWeight:"bold",fontSize:15 }}>{fmtSale(saleBalance.balance)}</div>
          </div>
        </div>
      )}

      {/* Botón de pago — solo si no está pagado */}
      {currentStatus !== 'pagado' && (
        <div style={{ marginBottom:12 }}>
          <button onClick={() => setShowPayModal(true)}
            style={{ width:"100%",background:"#27ae60",color:"#fff",border:"none",padding:"14px",borderRadius:6,
                     fontFamily:"inherit",fontWeight:"bold",letterSpacing:2,cursor:"pointer",fontSize:14 }}>
            💳 {currentStatus === 'parcial' ? "REGISTRAR ABONO" : "REGISTRAR PAGO"}
            {currentStatus === 'parcial' && saleBalance && (
              <span style={{ fontSize:11,fontWeight:"normal",marginLeft:8,opacity:0.8 }}>
                Saldo: {fmtSale(saleBalance.balance)}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Modal de pago unificado */}
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

      {/* Acciones finales */}
      <div style={{ display:"flex",gap:10 }}>
        <button onClick={() => setShowReceiptModal(true)}
          style={{ background:"transparent",color:"#f0a500",border:"1px solid #f0a500",padding:"10px 14px",borderRadius:4,fontFamily:"inherit",cursor:"pointer",fontSize:12 }}>
          🧾 Ver factura
        </button>
        <button onClick={() => { setReceipt(null); setSaleBalance(null); setShowPayModal(false); }}
          style={{ flex:1,background:"#f0a500",color:"#0f0f0f",border:"none",padding:"10px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",letterSpacing:2,cursor:"pointer",fontSize:13 }}>
          NUEVA VENTA
        </button>
      </div>

      <ReceiptModal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} sale={receipt} />
    </div>
  );}

  return (
    <div>
      {/* ── Selector de almacén ── */}
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"10px 14px",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,flexWrap:"wrap" }}>
        <span style={{ fontSize:11,color:"#555",letterSpacing:1,flexShrink:0 }}>ALMACÉN:</span>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {employeeWarehouses.map(w => (
            <button key={w.id} onClick={() => switchWarehouse(w)}
              style={{ background:activeWarehouse?.id===w.id?"#f0a500":"#0f0f0f",color:activeWarehouse?.id===w.id?"#0f0f0f":"#888",border:`1px solid ${activeWarehouse?.id===w.id?"#f0a500":"#333"}`,padding:"5px 14px",borderRadius:3,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:activeWarehouse?.id===w.id?"bold":"normal" }}>
              {w.name}
            </button>
          ))}
        </div>
        {activeWarehouse && (
          <span style={{ fontSize:11,color:"#27ae60",marginLeft:"auto" }}>
            ● Cobrando desde <b>{activeWarehouse.name}</b>
          </span>
        )}
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 360px",gap:20,alignItems:"start" }}>
        {/* ── Grid de productos ── */}
        <div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar producto o categoría..."
            style={{ width:"100%",background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"10px 14px",borderRadius:4,fontFamily:"inherit",fontSize:13,marginBottom:12,boxSizing:"border-box" }} />
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
            {products.map(p => (
              <div key={p.id} onClick={() => addToCart(p)}
                style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,overflow:"hidden",cursor:parseFloat(p.stock)>0&&activeWarehouse?"pointer":"not-allowed",opacity:(parseFloat(p.stock)===0||!activeWarehouse)?0.4:1,transition:"border-color .15s" }}
                onMouseEnter={e => { if(parseFloat(p.stock)>0&&activeWarehouse) e.currentTarget.style.borderColor="#f0a500"; }}
                onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a2a"}>
                <div style={{ height:70,width:"100%",background:"#111",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden" }}>
                  {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                               : <span style={{ fontSize:24,opacity:.2 }}>📦</span>}
                </div>
                <div style={{ padding:"8px 10px" }}>
                  <div style={{ fontSize:9,color:"#f0a500",marginBottom:2,letterSpacing:1 }}>{(p.category_name||"General").toUpperCase()}</div>
                  <div style={{ fontWeight:"bold",fontSize:12,marginBottom:4,lineHeight:1.3 }}>{p.name}</div>
                  <div style={{ fontSize:15,color:"#f0a500",fontWeight:"bold" }}>{fmt(convertToDisplay(p.price), currSym)}</div>
                  <div style={{ fontSize:10,color:parseFloat(p.stock)<=5?"#e74c3c":"#555",marginTop:2 }}>Stock: {p.stock} {p.unit||""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel carrito ── */}
        <div style={{ position:"sticky",top:12,background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:16,display:"flex",flexDirection:"column",gap:10 }}>
          {/* Header carrito + selector moneda */}
          <div style={{ fontWeight:"bold",fontSize:14,letterSpacing:2,color:"#f0a500",borderBottom:"1px solid #2a2a2a",paddingBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span>CARRITO</span>
            <select value={currentCurrency?.id||""}
              onChange={e => { const c = activeCurrencies.find(x => x.id===parseInt(e.target.value)); setSelectedCurrency(c?.is_base ? null : c||null); }}
              style={{ background:"#0f0f0f",border:"1px solid #444",color:"#f0a500",padding:"3px 8px",borderRadius:3,fontFamily:"inherit",fontSize:11,cursor:"pointer" }}>
              {activeCurrencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
            </select>
          </div>

          {currentCurrency && !currentCurrency.is_base && (
            <div style={{ background:"#1a1f2b",border:"1px solid #2980b9",borderRadius:4,padding:"6px 10px",fontSize:11,color:"#5dade2" }}>
              💱 1 {baseCurrency?.code} = {parseFloat(currentCurrency.exchange_rate).toFixed(4)} {currentCurrency.code}
            </div>
          )}

          {/* Items */}
          {cart.length === 0
            ? <div style={{ color:"#444",textAlign:"center",padding:"24px 0",fontSize:13 }}>
                {activeWarehouse ? "Selecciona productos →" : "⚠ Selecciona un almacén primero"}
              </div>
            : <div style={{ display:"flex",flexDirection:"column",gap:4,maxHeight:280,overflowY:"auto" }}>
                {cart.map(i => (
                  <div key={i.id} style={{ display:"flex",alignItems:"center",gap:6,background:"#111",borderRadius:4,padding:"5px 8px" }}>
                    <div style={{ flex:1,fontSize:12,lineHeight:1.3,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                      <div>{i.name}</div>
                      {i.unit && <div style={{ fontSize:10,color:"#555" }}>{i.unit}</div>}
                    </div>
                    <button onClick={() => changeQty(i.id,-1,products)} style={btnSmall}>−</button>
                    <input type="number" value={i.qty} min="0.001" step={i.qty_step||1}
                      onChange={e => setQtyDirect(i.id, e.target.value, products)}
                      style={{ width:44,background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"3px 4px",borderRadius:3,fontFamily:"inherit",fontSize:13,fontWeight:"bold",textAlign:"center" }} />
                    <button onClick={() => changeQty(i.id,1,products)} style={btnSmall}>+</button>
                    <div style={{ fontSize:12,color:"#f0a500",minWidth:54,textAlign:"right" }}>{fmt(convertToDisplay(parseFloat(i.price)*i.qty), currSym)}</div>
                    <button onClick={() => removeFromCart(i.id)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c",padding:"2px 6px" }}>✕</button>
                  </div>
                ))}
              </div>
          }

          <div style={{ borderTop:"1px solid #2a2a2a",paddingTop:12 }}>
            {/* Cliente */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,color:"#e74c3c",marginBottom:6,letterSpacing:1 }}>CLIENTE <span style={{ color:"#e74c3c" }}>*</span></div>
              {selectedCustomer
                ? <div style={{ background:"#0d1f2b",border:"1px solid #2980b9",borderRadius:4,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:"bold",color:"#5dade2" }}>{selectedCustomer.name}</div>
                      {selectedCustomer.rif && <div style={{ fontSize:10,color:"#888" }}>CI/RIF: {selectedCustomer.rif}</div>}
                      {selectedCustomer.phone && <div style={{ fontSize:10,color:"#555" }}>{selectedCustomer.phone}</div>}
                    </div>
                    <button onClick={() => { setSelectedCustomer(null); setCustSearch(""); }} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>✕</button>
                  </div>
                : <div style={{ position:"relative" }}>
                    <input value={custSearch} onChange={e => setCustSearch(e.target.value)}
                      placeholder="Nombre o cédula / RIF..."
                      style={{ width:"100%",background:"#0f0f0f",border:"1px solid #e74c3c",color:"#e8e0d0",padding:"7px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12,boxSizing:"border-box" }} />
                    {custSearch.trim().length > 0 && (
                      <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"#1a1a1a",border:"1px solid #333",borderRadius:4,zIndex:10,maxHeight:180,overflowY:"auto" }}>
                        {customers.length === 0
                          ? <div style={{ padding:"10px",fontSize:11,color:"#555",textAlign:"center" }}>Sin resultados</div>
                          : customers.map(c => (
                            <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustSearch(""); }}
                              style={{ padding:"8px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #222" }}
                              onMouseEnter={e => e.currentTarget.style.background="#222"}
                              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                              <div style={{ fontWeight:"bold" }}>{c.name}</div>
                              <div style={{ color:"#666",fontSize:10,display:"flex",gap:8 }}>
                                {c.rif   && <span>CI/RIF: {c.rif}</span>}
                                {c.phone && <span>{c.phone}</span>}
                              </div>
                            </div>
                          ))
                        }
                        <div onClick={() => { setCustomerEditData({ _newType:"cliente", _newName:custSearch, _fromCobro:true }); setCustomerModal(true); setCustSearch(""); }}
                          style={{ padding:"8px 10px",cursor:"pointer",fontSize:12,color:"#2980b9",display:"flex",alignItems:"center",gap:6 }}
                          onMouseEnter={e => e.currentTarget.style.background="#0d1f2b"}
                          onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                          <span style={{ fontSize:14,fontWeight:"bold" }}>+</span> Crear "{custSearch}"
                        </div>
                      </div>
                    )}
                  </div>
              }
            </div>

            {/* Total */}
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:14 }}>
              <span style={{ fontWeight:"bold",fontSize:16,letterSpacing:1 }}>TOTAL</span>
              <div style={{ textAlign:"right" }}>
                <span style={{ fontWeight:"bold",fontSize:20,color:"#f0a500" }}>{fmt(totalDisplay, currSym)}</span>
                {currentCurrency && !currentCurrency.is_base && (
                  <div style={{ fontSize:10,color:"#555" }}>{fmtPrice(totalBase)} {baseCurrency?.code}</div>
                )}
              </div>
            </div>

            {/* Serie de facturación */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11,color:"#e74c3c",marginBottom:6,letterSpacing:1 }}>SERIE <span>*</span></div>
              {mySeries.length === 0
                ? <div style={{ fontSize:11,color:"#e74c3c",fontStyle:"italic" }}>No tienes series asignadas. Configúralas en Contabilidad → Series</div>
                : <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,maxHeight:160,overflowY:"auto",border:selectedSerieId?"none":"1px solid #e74c3c44",borderRadius:4,padding:selectedSerieId?0:4 }}>
                    {mySeries.map(s => (
                      <button key={s.id} onClick={() => selectSerie(s.id)}
                        style={{ background:selectedSerieId===s.id?"#f0a500":"#0f0f0f",color:selectedSerieId===s.id?"#000":"#888",border:`1px solid ${selectedSerieId===s.id?"#f0a500":"#333"}`,padding:"8px",borderRadius:4,fontFamily:"inherit",fontSize:11,cursor:"pointer",fontWeight:selectedSerieId===s.id?"bold":"normal",textAlign:"left" }}>
                        <div style={{ fontWeight:"bold",fontSize:13 }}>{s.prefix}</div>
                        <div style={{ fontSize:10,opacity:.8 }}>{s.name}</div>
                      </button>
                    ))}
                  </div>
              }
            </div>

            <button onClick={() => checkout(() => loadProducts())} disabled={loading||!activeWarehouse||!selectedCustomer||!selectedSerieId}
              style={{ width:"100%",background:loading||!activeWarehouse||!selectedCustomer||!selectedSerieId?"#1a4a1a":"#27ae60",color:"#fff",border:"none",padding:14,borderRadius:4,fontFamily:"inherit",fontSize:14,fontWeight:"bold",letterSpacing:2,cursor:loading||!activeWarehouse||!selectedCustomer||!selectedSerieId?"not-allowed":"pointer" }}>
              {loading?"GENERANDO..."
                :!activeWarehouse?"SELECCIONA ALMACÉN"
                :!selectedCustomer?"SELECCIONA CLIENTE"
                :!selectedSerieId?"SELECCIONA SERIE"
                :"GENERAR FACTURA"}
            </button>
          </div>
        </div>
      </div>

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