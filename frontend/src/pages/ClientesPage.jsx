import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";

const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};
const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #333",
  color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};


export default function ClientesPage() {
  const { notify, baseCurrency } = useApp();

  const fmtPrice = (n) => `${baseCurrency?.symbol || "$"}${Number(n).toFixed(2)}`;
  const fmtSale  = (sale, amount) => {
    const isBase = !sale.currency_id || sale.currency_id === baseCurrency?.id;
    if (isBase) return fmtPrice(amount);
    const sym  = sale.currency_symbol || "Bs.";
    const rate = parseFloat(sale.exchange_rate) || 1;
    return `${sym}${(parseFloat(amount || 0) * rate).toFixed(2)}`;
  };

  // ── State ──────────────────────────────────────────────────
  const [customers, setCustomers]           = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [typeFilter, setTypeFilter]         = useState("cliente");
  const [customerDetail, setCustomerDetail] = useState(null);
  const [purchases, setPurchases]           = useState([]);

  // Modal crear/editar
  const [customerModal, setCustomerModal]     = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [saving, setSaving]                   = useState(false);

  // Pago de cuenta pendiente
  const [payModal, setPayModal] = useState(null);

  // ── Loaders ────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    try {
      const params = customerSearch ? { search: customerSearch } : {};
      if (typeFilter) params.type = typeFilter;
      const r = await api.customers.getAll(params);
      setCustomers(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [customerSearch, typeFilter]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openDetail = async (c) => {
    setCustomerDetail(c);
    try {
      const r = await api.customers.getPurchases(c.id);
      setPurchases(r.data);
    } catch (e) { notify(e.message, "err"); }
  };

  const refreshDetail = async () => {
    if (!customerDetail) return;
    try {
      const [cR, pR] = await Promise.all([
        api.customers.getOne(customerDetail.id),
        api.customers.getPurchases(customerDetail.id),
      ]);
      setCustomerDetail(cR.data);
      setPurchases(pR.data);
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
  };

  // ── CRUD ───────────────────────────────────────────────────
  const openNew  = (type = typeFilter) => {
    setCustomerEditData({ _newType: type });
    setCustomerModal(true);
  };
  const openEdit = (c) => { setCustomerEditData(c); setCustomerModal(true); setCustomerDetail(null); };
  const closeModal = () => { setCustomerModal(false); setCustomerEditData(null); };

  const save = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSaving(true);
    const label = form.type === "proveedor" ? "Proveedor" : "Cliente";
    try {
      if (customerEditData?.id) {
        await api.customers.update(customerEditData.id, form);
        notify(`${label} actualizado ✓`);
      } else {
        await api.customers.create(form);
        notify(`${label} registrado ✓`);
      }
      closeModal();
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
    finally { setSaving(false); }
  };

  const remove = async (id, type) => {
    const label = type === "proveedor" ? "proveedor" : "cliente";
    if (!confirm(`¿Eliminar este ${label}?`)) return;
    try {
      await api.customers.remove(id);
      notify(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
  };

  // ── Pago de fiado ──────────────────────────────────────────
  const openPay = (sale) => setPayModal(sale);

  const isProveedor = typeFilter === "proveedor";

  const filteredList = customers.filter(c =>
    c.type === typeFilter &&
    (!customerSearch ||
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone||"").includes(customerSearch) ||
      (c.rif||"").toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const pendingSales = purchases.filter(s => s.status === 'pendiente' || s.status === 'parcial');
  const paidSales    = purchases.filter(s => s.status === 'pagado');

  // ── Vista detalle ──────────────────────────────────────────
  if (customerDetail) return (
    <div>
      <button onClick={() => { setCustomerDetail(null); setPurchases([]); }}
        style={{ ...btnSmall, marginBottom: 20, padding: "7px 16px", fontSize: 12, color: "#f0a500", borderColor: "#f0a500" }}>
        ← Volver
      </button>

      {/* Header cliente */}
      <div style={{ background:"#1a1a1a",border:"1px solid #2980b9",borderRadius:6,padding:20,marginBottom:24,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
        <div>
          <div style={{ fontSize:18,fontWeight:"bold",color:"#5dade2" }}>{customerDetail.name}</div>
          {customerDetail.rif   && <div style={{ fontSize:12,color:"#888",marginTop:4 }}>🪪 {customerDetail.rif}</div>}
          {customerDetail.phone && <div style={{ fontSize:12,color:"#888" }}>📞 {customerDetail.phone}</div>}
          {customerDetail.email && <div style={{ fontSize:12,color:"#888" }}>✉ {customerDetail.email}</div>}
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          <div>
            <div style={{ fontSize:11,color:"#555",marginBottom:2 }}>TOTAL COMPRAS</div>
            <div style={{ fontSize:22,fontWeight:"bold",color:"#f0a500" }}>{customerDetail.total_purchases}</div>
          </div>
          <div>
            <div style={{ fontSize:11,color:"#555",marginBottom:2 }}>TOTAL COBRADO</div>
            <div style={{ fontSize:16,fontWeight:"bold",color:"#27ae60" }}>{fmtPrice(customerDetail.total_spent)}</div>
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11,color:"#555",marginBottom:6,letterSpacing:1 }}>CUENTAS POR COBRAR</div>
          {parseFloat(customerDetail.total_debt || 0) > 0
            ? <div style={{ fontSize:28,fontWeight:"bold",color:"#e74c3c" }}>{fmtPrice(customerDetail.total_debt)}</div>
            : <div style={{ fontSize:20,color:"#27ae60",fontWeight:"bold" }}>✓ Al día</div>
          }
          {pendingSales.length > 0 && (
            <div style={{ fontSize:11,color:"#888",marginTop:4 }}>{pendingSales.length} factura{pendingSales.length>1?"s":""} pendiente{pendingSales.length>1?"s":""}</div>
          )}
        </div>
      </div>

      {/* Fiado activo */}
      {pendingSales.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontWeight:"bold",fontSize:13,color:"#e74c3c",letterSpacing:2,marginBottom:14 }}>CUENTAS PENDIENTES</div>
          {pendingSales.map(sale => (
            <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #e74c3c44",borderRadius:6,padding:16,marginBottom:10 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                <span style={{ fontSize:11,color:"#555" }}>Factura #{sale.id}</span>
                {sale.status === 'parcial'
                  ? <span style={{ fontSize:9,background:"#f0a50022",color:"#f0a500",border:"1px solid #f0a50044",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PARCIAL</span>
                  : <span style={{ fontSize:9,background:"#e74c3c22",color:"#e74c3c",border:"1px solid #e74c3c44",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PENDIENTE</span>
                }
                <span style={{ fontSize:11,color:"#666" }}>{new Date(sale.created_at).toLocaleDateString("es-VE")}</span>
                <div style={{ flex:1 }} />
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:12,color:"#888" }}>Total: {fmtSale(sale, sale.total)}</div>
                  {sale.amount_paid > 0 && <div style={{ fontSize:11,color:"#27ae60" }}>Pagado: {fmtSale(sale, sale.amount_paid)}</div>}
                  <div style={{ fontSize:15,fontWeight:"bold",color:"#e74c3c" }}>Saldo: {fmtSale(sale, sale.balance)}</div>
                </div>
                <button onClick={() => openPay(sale)}
                  style={{ background:"#27ae60",color:"#fff",border:"none",padding:"8px 16px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:"bold",whiteSpace:"nowrap" }}>
                  ✓ Registrar pago
                </button>
              </div>
              {sale.items?.length > 0 && (
                <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginTop:10 }}>
                  {sale.items.map((item,idx) => (
                    <span key={idx} style={{ fontSize:11,background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"3px 8px",color:"#888" }}>
                      {item.name} ×{item.quantity}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Historial pagado */}
      <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>HISTORIAL DE COMPRAS</div>
      {paidSales.length === 0
        ? <div style={{ textAlign:"center",color:"#444",padding:"30px 0" }}>Sin compras pagadas</div>
        : paidSales.map(sale => (
          <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:16,marginBottom:10 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8 }}>
              <span style={{ fontSize:11,color:"#555" }}>Factura #{sale.id}</span>
              <span style={{ fontSize:9,background:"#27ae6022",color:"#27ae60",border:"1px solid #27ae6044",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PAGADO</span>
              <span style={{ fontSize:11,color:"#666" }}>{new Date(sale.created_at).toLocaleString("es-VE")}</span>
              <span style={{ fontWeight:"bold",color:"#f0a500" }}>{fmtSale(sale, sale.total)}</span>
            </div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
              {sale.items?.map((item,idx) => (
                <span key={idx} style={{ fontSize:11,background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"3px 8px",color:"#888" }}>
                  {item.name} ×{item.quantity}
                </span>
              ))}
            </div>
          </div>
        ))
      }

      {/* Modal pago unificado */}
      {payModal && (
        <PaymentFormModal
          sale={payModal}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); refreshDetail(); }}
        />
      )}

      <CustomerModal open={customerModal} onClose={closeModal} onSave={save} editData={customerEditData} loading={saving} />
    </div>
  );

  // ── Vista lista ────────────────────────────────────────────
  return (
    <div>
      <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap" }}>
        <div style={{ display:"flex",background:"#111",borderRadius:4,padding:3,flexShrink:0 }}>
          {[["cliente","👤 Clientes"],["proveedor","🏭 Proveedores"]].map(([val,label]) => (
            <button key={val} onClick={() => { setTypeFilter(val); setCustomerSearch(""); }}
              style={{ background:typeFilter===val?(val==="cliente"?"#2980b9":"#8e44ad"):"transparent",color:typeFilter===val?"#fff":"#555",border:"none",padding:"6px 16px",borderRadius:3,fontFamily:"inherit",fontSize:11,fontWeight:"bold",cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
          placeholder={`🔍 Buscar ${isProveedor ? "proveedor" : "cliente"}...`}
          style={{ flex:1,background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"9px 14px",borderRadius:4,fontFamily:"inherit",fontSize:13,boxSizing:"border-box" }} />

        <button onClick={() => openNew(typeFilter)}
          style={{ background:isProveedor?"#8e44ad":"#2980b9",color:"#fff",border:"none",padding:"10px 20px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
          + {isProveedor ? "Nuevo proveedor" : "Nuevo cliente"}
        </button>
      </div>

      {filteredList.length === 0
        ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0",fontSize:13 }}>
            Sin {isProveedor?"proveedores":"clientes"} registrados.
          </div>
        : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${isProveedor?"#8e44ad":"#2980b9"}`,color:isProveedor?"#9b59b6":"#5dade2" }}>
                {(isProveedor
                  ? ["Nombre / Empresa","Teléfono","RIF / Cédula","Razón Social","Dirección","Acciones"]
                  : ["Nombre","Teléfono","RIF / Cédula","Compras","Total cobrado","Ctas. pendientes","Acciones"]
                ).map(h => <th key={h} style={{ textAlign:"left",padding:"10px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredList.map((c,i) => (
                <tr key={c.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                  <td style={{ padding:"10px 12px",fontWeight:"bold" }}>{c.name}</td>
                  <td style={{ padding:"10px 12px",color:"#888" }}>{c.phone||"—"}</td>
                  <td style={{ padding:"10px 12px",color:"#888",fontSize:11 }}>{c.rif||"—"}</td>
                  {isProveedor
                    ? <>
                        <td style={{ padding:"10px 12px",color:"#aaa",fontSize:12 }}>{c.tax_name||"—"}</td>
                        <td style={{ padding:"10px 12px",color:"#666",fontSize:11 }}>{c.address||"—"}</td>
                      </>
                    : <>
                        <td style={{ padding:"10px 12px",color:"#f0a500" }}>{c.total_purchases}</td>
                        <td style={{ padding:"10px 12px",color:"#27ae60" }}>{fmtPrice(c.total_spent)}</td>
                        <td style={{ padding:"10px 12px" }}>
                          {parseFloat(c.total_debt||0) > 0
                            ? <span style={{ color:"#e74c3c",fontWeight:"bold" }}>{fmtPrice(c.total_debt)}</span>
                            : <span style={{ color:"#444",fontSize:11 }}>—</span>
                          }
                        </td>
                      </>
                  }
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex",gap:6 }}>
                      {!isProveedor && (
                        <button onClick={() => openDetail(c)} style={{ ...btnSmall,color:"#5dade2",borderColor:"#2980b9" }}>Detalle</button>
                      )}
                      <button onClick={() => openEdit(c)} style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Editar</button>
                      <button onClick={() => remove(c.id, c.type)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      }

      <CustomerModal open={customerModal} onClose={closeModal} onSave={save} editData={customerEditData} loading={saving} />
    </div>
  );
}
