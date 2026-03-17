import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";

const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

export default function ClientesPage() {
  const { notify, baseCurrency } = useApp();

  const fmtPrice = (n) => `${baseCurrency?.symbol || "$"}${Number(n).toFixed(2)}`;

  // ── State ──────────────────────────────────────────────────
  const [customers, setCustomers]           = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [typeFilter, setTypeFilter]         = useState("cliente");
  const [customerDetail, setCustomerDetail] = useState(null);
  const [customerPurchases, setCustomerPurchases] = useState([]);

  // Modal
  const [customerModal, setCustomerModal]     = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [saving, setSaving]                   = useState(false);

  // ── Loaders ────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    try {
      const params = customerSearch ? { search: customerSearch } : {};
      const r = await api.customers.getAll(params);
      setCustomers(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [customerSearch]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // ── CRUD ───────────────────────────────────────────────────
  const openNew  = (type = typeFilter, name = "", fromCobro = false) => {
    setCustomerEditData({ _newType: type, _newName: name, _fromCobro: fromCobro });
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

  // ── Historial ──────────────────────────────────────────────
  const openDetail = async (c) => {
    setCustomerDetail(c);
    try { const r = await api.customers.getPurchases(c.id); setCustomerPurchases(r.data); }
    catch (e) { notify(e.message, "err"); }
  };

  const isProveedor = typeFilter === "proveedor";

  const filteredList = customers.filter(c =>
    c.type === typeFilter &&
    (!customerSearch ||
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone||"").includes(customerSearch) ||
      (c.rif||"").toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.tax_name||"").toLowerCase().includes(customerSearch.toLowerCase()))
  );

  // ── Vista detalle ──────────────────────────────────────────
  if (customerDetail) return (
    <div>
      <button onClick={() => { setCustomerDetail(null); setCustomerPurchases([]); }}
        style={{ ...btnSmall,marginBottom:20,padding:"7px 16px",fontSize:12,color:"#f0a500",borderColor:"#f0a500" }}>
        ← Volver
      </button>

      <div style={{ background:"#1a1a1a",border:"1px solid #2980b9",borderRadius:6,padding:20,marginBottom:24,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
        <div>
          <div style={{ fontSize:18,fontWeight:"bold",color:"#5dade2" }}>{customerDetail.name}</div>
          {customerDetail.phone && <div style={{ fontSize:12,color:"#888",marginTop:4 }}>📞 {customerDetail.phone}</div>}
          {customerDetail.email && <div style={{ fontSize:12,color:"#888" }}>✉ {customerDetail.email}</div>}
        </div>
        <div>
          {customerDetail.rif && <>
            <div style={{ fontSize:11,color:"#555",marginBottom:2 }}>RIF / Cédula</div>
            <div style={{ fontSize:13,marginBottom:8 }}>{customerDetail.rif}</div>
          </>}
          {customerDetail.tax_name && <div style={{ fontSize:12,color:"#aaa" }}>{customerDetail.tax_name}</div>}
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11,color:"#555",marginBottom:4 }}>TOTAL COMPRAS</div>
          <div style={{ fontSize:28,fontWeight:"bold",color:"#f0a500" }}>{customerDetail.total_purchases}</div>
          <div style={{ fontSize:11,color:"#555",marginTop:8,marginBottom:4 }}>TOTAL GASTADO</div>
          <div style={{ fontSize:20,fontWeight:"bold",color:"#27ae60" }}>{fmtPrice(customerDetail.total_spent)}</div>
        </div>
      </div>

      <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>HISTORIAL DE COMPRAS</div>
      {customerPurchases.length === 0
        ? <div style={{ textAlign:"center",color:"#444",padding:"30px 0" }}>Sin compras registradas</div>
        : customerPurchases.map(sale => (
          <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:16,marginBottom:10 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:11,color:"#555" }}>Venta #{sale.id}</span>
              <span style={{ fontSize:11,color:"#666" }}>{new Date(sale.created_at).toLocaleString("es-VE")}</span>
              <span style={{ fontWeight:"bold",color:"#f0a500" }}>{fmtPrice(sale.total)}</span>
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

      <CustomerModal
        open={customerModal}
        onClose={closeModal}
        onSave={save}
        editData={customerEditData}
        loading={saving}
      />
    </div>
  );

  // ── Vista lista ────────────────────────────────────────────
  return (
    <div>
      {/* Filtros */}
      <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap" }}>
        {/* Toggle cliente / proveedor */}
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

      {/* Tabla */}
      {filteredList.length === 0
        ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0",fontSize:13 }}>
            Sin {isProveedor?"proveedores":"clientes"} registrados.
          </div>
        : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${isProveedor?"#8e44ad":"#2980b9"}`,color:isProveedor?"#9b59b6":"#5dade2" }}>
                {(isProveedor
                  ? ["Nombre / Empresa","Teléfono","RIF / Cédula","Razón Social","Dirección","Acciones"]
                  : ["Nombre","Teléfono","RIF / Cédula","Compras","Total gastado","Acciones"]
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
                      </>
                  }
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex",gap:6 }}>
                      {!isProveedor && (
                        <button onClick={() => openDetail(c)} style={{ ...btnSmall,color:"#5dade2",borderColor:"#2980b9" }}>Historial</button>
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

      <CustomerModal
        open={customerModal}
        onClose={closeModal}
        onSave={save}
        editData={customerEditData}
        loading={saving}
      />
    </div>
  );
}