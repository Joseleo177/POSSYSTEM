import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";

const fmt = (n, symbol = "$") => `${symbol}${Number(n).toFixed(2)}`;

const EMPTY_JOURNAL = { name:"", type:"", bank_id:"", color:"#555555", currency_id:"" };
const EMPTY_BANK    = { name:"", code:"", sort_order:0 };
const EMPTY_METHOD  = { name:"", code:"", icon:"💳", color:"#555555", sort_order:0 };

const SUB_PAGES = ["Transacciones", "Diarios", "Tipos de pago", "Bancos"];

const btnSmall = {
  background:"transparent", color:"#888", border:"1px solid #333",
  padding:"3px 8px", borderRadius:3, cursor:"pointer", fontFamily:"inherit", fontSize:11,
};
const inp = {
  width:"100%", background:"#0f0f0f", border:"1px solid #333",
  color:"#e8e0d0", padding:"8px 10px", borderRadius:4,
  fontFamily:"inherit", fontSize:13, boxSizing:"border-box",
};
const selStyle = {
  background:"#0f0f0f", border:"1px solid #333", color:"#e8e0d0",
  padding:"4px 8px", borderRadius:3, fontFamily:"inherit", fontSize:12,
};

// ── Balance por diario ────────────────────────────────────────
function JournalSummary({ dateFrom, dateTo }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    api.journals.getSummary(params).then(r => setData(r.data)).catch(() => {});
  }, [dateFrom, dateTo]);
  if (!data.length) return null;
  return (
    <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"14px 16px",marginBottom:20 }}>
      <div style={{ fontSize:11,color:"#555",letterSpacing:1,marginBottom:12 }}>BALANCE POR DIARIO DE PAGO</div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
        {data.map(j => {
          const sym  = j.currency_symbol || "$";
          const fmtJ = n => `${sym}${Number(n).toFixed(2)}`;
          return (
            <div key={j.id} style={{ background:"#111",border:`2px solid ${j.color||"#333"}`,borderRadius:8,padding:"10px 16px",minWidth:160 }}>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                <div style={{ width:10,height:10,borderRadius:"50%",background:j.color||"#555" }} />
                <div style={{ fontSize:12,fontWeight:"bold",color:"#e8e0d0" }}>{j.name}</div>
                {j.currency_code && <span style={{ fontSize:9,color:"#555",background:"#1e1e1e",border:"1px solid #2a2a2a",borderRadius:3,padding:"1px 5px",marginLeft:"auto" }}>{j.currency_code}</span>}
              </div>
              {(j.bank_name||j.bank) && <div style={{ fontSize:10,color:"#555",marginBottom:6 }}>{j.bank_name||j.bank}</div>}
              <div style={{ fontSize:20,fontWeight:"bold",color:j.color||"#f0a500" }}>{fmtJ(j.total_ingresos)}</div>
              <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
                <span style={{ fontSize:10,color:"#555" }}>{j.tx_count} transac.</span>
                <span style={{ fontSize:10,color:"#27ae60" }}>Hoy: {fmtJ(j.ingresos_hoy)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ContabilidadPage() {
  const {
    notify, can,
    journals, loadJournals,
    currencies, baseCurrency,
    banks, loadBanks,
    paymentMethods, loadPaymentMethods,
  } = useApp();

  const activeMethods = paymentMethods.filter(m => m.active);
  const activeBanks   = banks.filter(b => b.active);
  const methodByCode  = Object.fromEntries(paymentMethods.map(m => [m.code, m]));

  const fmtPrice = n => fmt(n, baseCurrency?.symbol || "$");

  // ── Dropdown hover ─────────────────────────────────────────
  const [subPage, setSubPage]   = useState("Transacciones");
  const [dropOpen, setDropOpen] = useState(false);

  // ══════════════════════════════════════════════════════════
  // TRANSACCIONES
  // ══════════════════════════════════════════════════════════
  const [sales,        setSales]        = useState([]);
  const [stats,        setStats]        = useState(null);
  const [histDateFrom, setHistDateFrom] = useState("");
  const [histDateTo,   setHistDateTo]   = useState("");
  const [histMethod,   setHistMethod]   = useState("");
  const [saleDetail,   setSaleDetail]   = useState(null);

  const loadSales = useCallback(async () => {
    try {
      const params = {};
      if (histDateFrom) params.date_from = histDateFrom;
      if (histDateTo)   params.date_to   = histDateTo;
      if (histMethod)   params.payment_method = histMethod;
      const [sR, stR] = await Promise.all([
        api.sales.getAll(params),
        api.sales.getStats(params),
      ]);
      setSales(sR.data); setStats(stR.data);
    } catch (e) { notify(e.message, "err"); }
  }, [histDateFrom, histDateTo, histMethod, notify]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const cancelSale = async (id) => {
    if (!confirm("¿Anular esta venta? Se restaurará el stock.")) return;
    try { await api.sales.cancel(id); notify("Venta anulada ✓"); loadSales(); }
    catch (e) { notify(e.message, "err"); }
  };

  // ══════════════════════════════════════════════════════════
  // DIARIOS
  // ══════════════════════════════════════════════════════════
  const [newJournal,  setNewJournal]  = useState(EMPTY_JOURNAL);
  const [editJournal, setEditJournal] = useState(null);

  const addJournal = async () => {
    if (!newJournal.name) return notify("El nombre es requerido", "err");
    try { await api.journals.create(newJournal); notify("Diario creado ✓"); setNewJournal(EMPTY_JOURNAL); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const saveJournal = async () => {
    if (!editJournal.name) return notify("El nombre es requerido", "err");
    try { await api.journals.update(editJournal.id, editJournal); notify("Diario actualizado ✓"); setEditJournal(null); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const toggleJournal = async (j) => {
    try { await api.journals.update(j.id, { ...j, active: !j.active }); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };
  const deleteJournal = async (id) => {
    if (!confirm("¿Eliminar este diario?")) return;
    try { await api.journals.remove(id); notify("Diario eliminado"); loadJournals(); }
    catch (e) { notify(e.message, "err"); }
  };

  // ══════════════════════════════════════════════════════════
  // BANCOS
  // ══════════════════════════════════════════════════════════
  const [bankForm,   setBankForm]   = useState(EMPTY_BANK);
  const [bankEditId, setBankEditId] = useState(null);
  const [bankSaving, setBankSaving] = useState(false);

  const saveBank = async () => {
    if (!bankForm.name.trim()) return notify("El nombre es requerido", "err");
    setBankSaving(true);
    try {
      if (bankEditId) {
        await api.banks.update(bankEditId, bankForm);
        notify("Banco actualizado ✓");
      } else {
        await api.banks.create(bankForm);
        notify("Banco creado ✓");
      }
      setBankForm(EMPTY_BANK); setBankEditId(null); loadBanks();
    } catch (e) { notify(e.message, "err"); }
    finally { setBankSaving(false); }
  };

  const toggleBank = async (b) => {
    try { await api.banks.toggle(b.id); loadBanks(); }
    catch (e) { notify(e.message, "err"); }
  };

  const removeBank = async (b) => {
    if (!confirm(`¿Eliminar "${b.name}"?`)) return;
    try { await api.banks.remove(b.id); notify("Banco eliminado"); loadBanks(); }
    catch (e) { notify(e.message, "err"); }
  };

  // ══════════════════════════════════════════════════════════
  // MÉTODOS DE PAGO
  // ══════════════════════════════════════════════════════════
  const [methodForm,   setMethodForm]   = useState(EMPTY_METHOD);
  const [methodEditId, setMethodEditId] = useState(null);
  const [methodSaving, setMethodSaving] = useState(false);

  const saveMethod = async () => {
    if (!methodForm.name.trim()) return notify("El nombre es requerido", "err");
    if (!methodEditId && !methodForm.code.trim()) return notify("El código es requerido", "err");
    setMethodSaving(true);
    try {
      if (methodEditId) {
        await api.paymentMethods.update(methodEditId, methodForm);
        notify("Método actualizado ✓");
      } else {
        await api.paymentMethods.create(methodForm);
        notify("Método creado ✓");
      }
      setMethodForm(EMPTY_METHOD); setMethodEditId(null); loadPaymentMethods();
    } catch (e) { notify(e.message, "err"); }
    finally { setMethodSaving(false); }
  };

  const toggleMethod = async (m) => {
    try { await api.paymentMethods.toggle(m.id); loadPaymentMethods(); }
    catch (e) { notify(e.message, "err"); }
  };

  const removeMethod = async (m) => {
    if (!confirm(`¿Eliminar "${m.name}"?`)) return;
    try { await api.paymentMethods.remove(m.id); notify("Método eliminado"); loadPaymentMethods(); }
    catch (e) { notify(e.message, "err"); }
  };

  return (
    <div>
      {/* ── Dropdown hover nav ── */}
      <div style={{ display:"flex",gap:0,marginBottom:20,borderBottom:"2px solid #1e1e1e",position:"relative" }}>
        {SUB_PAGES.map(s => (
          <button key={s} onClick={() => setSubPage(s)}
            style={{ background:"transparent",color:subPage===s?"#f0a500":"#555",border:"none",borderBottom:subPage===s?"2px solid #f0a500":"2px solid transparent",padding:"8px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:subPage===s?"bold":"normal",letterSpacing:1,marginBottom:-2,transition:"color .15s" }}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TRANSACCIONES
      ══════════════════════════════════════════════════════ */}
      {subPage === "Transacciones" && (
        <div>
          {stats && (
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 }}>
              {[
                ["VENTAS",   stats.total_sales],
                ["INGRESOS", fmtPrice(stats.total_revenue)],
                ["PROMEDIO", fmtPrice(stats.avg_sale)],
                ["HOY",      `${stats.sales_today} · ${fmtPrice(stats.revenue_today)}`],
              ].map(([label,val]) => (
                <div key={label} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"14px 16px" }}>
                  <div style={{ fontSize:10,color:"#555",letterSpacing:1,marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:18,fontWeight:"bold",color:"#f0a500" }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          <JournalSummary dateFrom={histDateFrom} dateTo={histDateTo} />

          {/* Filtros */}
          <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap" }}>
            <div style={{ fontSize:11,color:"#555" }}>FILTRAR:</div>
            <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
              style={{ background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"6px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
            <span style={{ color:"#555",fontSize:12 }}>→</span>
            <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
              style={{ background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"6px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
            <select value={histMethod} onChange={e => setHistMethod(e.target.value)}
              style={{ background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"6px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }}>
              <option value="">Todos los métodos</option>
              {paymentMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
            </select>
            {(histDateFrom||histDateTo||histMethod) && (
              <button onClick={() => { setHistDateFrom(""); setHistDateTo(""); setHistMethod(""); }}
                style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c",padding:"5px 10px" }}>✕ Limpiar</button>
            )}
          </div>

          {/* Lista ventas */}
          {sales.length === 0
            ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0" }}>Sin ventas en este período</div>
            : sales.map(sale => (
              <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:16,marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8,flexWrap:"wrap" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:11,color:"#555" }}>#{sale.id}</span>
                    {sale.journal_name
                      ? <span style={{ fontSize:10,background:(sale.journal_color||"#555")+"22",color:sale.journal_color||"#888",border:`1px solid ${(sale.journal_color||"#555")}44`,padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4 }}>
                          <div style={{ width:6,height:6,borderRadius:"50%",background:sale.journal_color||"#555" }} />{sale.journal_name}
                        </span>
                      : (() => {
                          const m = methodByCode[sale.payment_method];
                          const col = m?.color || "#555";
                          return (
                            <span style={{ fontSize:10,background:col+"22",color:col,border:`1px solid ${col}44`,padding:"2px 8px",borderRadius:3 }}>
                              {m ? `${m.icon} ${m.name}` : (sale.payment_method||"efectivo")}
                            </span>
                          );
                        })()
                    }
                    {sale.warehouse_name && <span style={{ fontSize:10,color:"#555",border:"1px solid #2a2a2a",padding:"2px 8px",borderRadius:3 }}>📦 {sale.warehouse_name}</span>}
                    {sale.customer_name  && <span style={{ fontSize:11,color:"#5dade2" }}>👤 {sale.customer_name}</span>}
                    {sale.employee_name  && <span style={{ fontSize:11,color:"#888" }}>· {sale.employee_name}</span>}
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontSize:11,color:"#666" }}>{new Date(sale.created_at).toLocaleString("es-VE")}</span>
                    <span style={{ fontWeight:"bold",color:"#f0a500",fontSize:15 }}>{fmtPrice(sale.total)}</span>
                    <button onClick={() => setSaleDetail(saleDetail?.id===sale.id?null:sale)}
                      style={{ ...btnSmall,color:"#5dade2",borderColor:"#2980b9" }}>
                      {saleDetail?.id===sale.id?"▲ Cerrar":"▼ Detalle"}
                    </button>
                    {can("admin") && (
                      <button onClick={() => cancelSale(sale.id)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Anular</button>
                    )}
                  </div>
                </div>
                {saleDetail?.id===sale.id && (
                  <div style={{ borderTop:"1px solid #2a2a2a",paddingTop:10,marginTop:4 }}>
                    <table style={{ width:"100%",fontSize:12,borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ color:"#555",fontSize:11 }}>
                          {["Producto","Cantidad","Precio u.","Subtotal"].map(h =>
                            <th key={h} style={{ textAlign:"left",padding:"4px 8px" }}>{h}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {sale.items.map((item,idx) => (
                          <tr key={idx} style={{ borderTop:"1px solid #1e1e1e" }}>
                            <td style={{ padding:"5px 8px" }}>{item.name}</td>
                            <td style={{ padding:"5px 8px",textAlign:"right",color:"#888" }}>{item.quantity}</td>
                            <td style={{ padding:"5px 8px",textAlign:"right",color:"#888" }}>{fmtPrice(item.price)}</td>
                            <td style={{ padding:"5px 8px",textAlign:"right",color:"#f0a500",fontWeight:"bold" }}>{fmtPrice(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:"2px solid #2a2a2a" }}>
                          <td colSpan={3} style={{ padding:"6px 8px",textAlign:"right",color:"#888",fontSize:11 }}>TOTAL</td>
                          <td style={{ padding:"6px 8px",textAlign:"right",fontWeight:"bold",color:"#f0a500" }}>{fmtPrice(sale.total)}</td>
                        </tr>
                        {sale.discount_amount>0 && (
                          <tr>
                            <td colSpan={3} style={{ padding:"3px 8px",textAlign:"right",color:"#888",fontSize:11 }}>DESCUENTO</td>
                            <td style={{ padding:"3px 8px",textAlign:"right",color:"#e74c3c" }}>-{fmtPrice(sale.discount_amount)}</td>
                          </tr>
                        )}
                        <tr><td colSpan={3} style={{ padding:"3px 8px",textAlign:"right",color:"#888",fontSize:11 }}>PAGADO</td><td style={{ padding:"3px 8px",textAlign:"right",color:"#27ae60" }}>{fmtPrice(sale.paid)}</td></tr>
                        <tr><td colSpan={3} style={{ padding:"3px 8px",textAlign:"right",color:"#888",fontSize:11 }}>CAMBIO</td><td style={{ padding:"3px 8px",textAlign:"right",color:"#888" }}>{fmtPrice(sale.change)}</td></tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DIARIOS
      ══════════════════════════════════════════════════════ */}
      {subPage === "Diarios" && (
        <div>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,marginBottom:20 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:4 }}>DIARIOS DE PAGO</div>
            <div style={{ fontSize:11,color:"#555",marginBottom:16 }}>Cada diario representa una cuenta o banco.</div>
            {journals.length === 0
              ? <div style={{ textAlign:"center",color:"#444",padding:"24px 0",fontSize:12 }}>No hay diarios configurados.</div>
              : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                      {["","Nombre","Método","Banco","Moneda","Estado",...(can("config")?["Acciones"]:[])].map(h =>
                        <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {journals.map((j,i) => {
                      const isEdit = editJournal?.id === j.id;
                      const editInp = { background:"#0f0f0f",border:"1px solid #f0a500",color:"#e8e0d0",padding:"4px 8px",borderRadius:3,fontFamily:"inherit",fontSize:12,width:"100%" };
                      return (
                        <tr key={j.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e" }}>
                          <td style={{ padding:"8px 12px",width:24 }}>
                            <div style={{ width:14,height:14,borderRadius:"50%",background:j.color }} />
                          </td>
                          <td style={{ padding:"10px 12px",fontWeight:"bold" }}>
                            {isEdit
                              ? <input value={editJournal.name} onChange={e => setEditJournal(p => ({...p,name:e.target.value}))} style={editInp} />
                              : j.name}
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            {isEdit
                              ? <select value={editJournal.type||""} onChange={e => setEditJournal(p => ({...p,type:e.target.value}))} style={selStyle}>
                                  <option value="">— Sin tipo</option>
                                  {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                                </select>
                              : (() => { const m = methodByCode[j.type]; return <span style={{ fontSize:11,color:"#888" }}>{m?`${m.icon} ${m.name}`:(j.type||"—")}</span>; })()
                            }
                          </td>
                          <td style={{ padding:"10px 12px",color:"#888",fontSize:12 }}>
                            {isEdit
                              ? <select value={editJournal.bank_id||""} onChange={e => setEditJournal(p => ({...p,bank_id:e.target.value||""}))} style={selStyle}>
                                  <option value="">— Sin banco</option>
                                  {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                              : (j.bank_name||j.bank) ? <span>{j.bank_name||j.bank}</span> : <span style={{ color:"#444" }}>—</span>
                            }
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            {isEdit
                              ? <select value={editJournal.currency_id||""} onChange={e => setEditJournal(p => ({...p,currency_id:e.target.value||null}))} style={selStyle}>
                                  <option value="">— Sin asignar</option>
                                  {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                                </select>
                              : j.currency_code
                                ? <span style={{ fontSize:12,fontWeight:"bold",color:"#f0a500" }}>{j.currency_symbol} {j.currency_code}</span>
                                : <span style={{ color:"#444",fontSize:11 }}>—</span>
                            }
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:11,color:j.active?"#27ae60":"#e74c3c" }}>{j.active?"● Activo":"○ Inactivo"}</span>
                          </td>
                          {can("config") && (
                            <td style={{ padding:"10px 12px" }}>
                              <div style={{ display:"flex",gap:6 }}>
                                {isEdit ? (
                                  <>
                                    <button onClick={saveJournal} style={{ ...btnSmall,color:"#27ae60",borderColor:"#27ae60" }}>✓ Guardar</button>
                                    <button onClick={() => setEditJournal(null)} style={btnSmall}>✕</button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => setEditJournal({...j})} style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Editar</button>
                                    <button onClick={() => toggleJournal(j)} style={{ ...btnSmall,color:j.active?"#e74c3c":"#27ae60",borderColor:j.active?"#e74c3c":"#27ae60" }}>{j.active?"Desact.":"Activar"}</button>
                                    <button onClick={() => deleteJournal(j.id)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {can("config") && (
            <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
              <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>+ NUEVO DIARIO</div>
              <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 80px auto",gap:10,alignItems:"end" }}>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nombre *</div>
                  <input value={newJournal.name} onChange={e => setNewJournal(p => ({...p,name:e.target.value}))} placeholder="ej. Pago Móvil BDV" style={inp} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Método de pago</div>
                  <select value={newJournal.type} onChange={e => setNewJournal(p => ({...p,type:e.target.value}))} style={inp}>
                    <option value="">— Sin tipo</option>
                    {activeMethods.map(m => <option key={m.code} value={m.code}>{m.icon} {m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Banco</div>
                  <select value={newJournal.bank_id} onChange={e => setNewJournal(p => ({...p,bank_id:e.target.value||""}))} style={inp}>
                    <option value="">— Sin banco</option>
                    {activeBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Moneda</div>
                  <select value={newJournal.currency_id||""} onChange={e => setNewJournal(p => ({...p,currency_id:e.target.value||""}))} style={inp}>
                    <option value="">— Sin asignar</option>
                    {currencies.map(c => <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Color</div>
                  <input type="color" value={newJournal.color} onChange={e => setNewJournal(p => ({...p,color:e.target.value}))}
                    style={{ width:"100%",height:38,padding:4,background:"#0f0f0f",border:"1px solid #333",borderRadius:4,cursor:"pointer",boxSizing:"border-box" }} />
                </div>
                <button onClick={addJournal} style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 16px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
                  Crear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BANCOS
      ══════════════════════════════════════════════════════ */}
      {subPage === "Bancos" && (
        <div style={{ maxWidth:860 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,marginBottom:20 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:16 }}>BANCOS E INSTITUCIONES</div>
            {banks.length === 0
              ? <div style={{ textAlign:"center",color:"#444",padding:"24px 0",fontSize:12 }}>Sin bancos registrados.</div>
              : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                      {["Nombre","Código","Diarios","Estado","Acciones"].map(h =>
                        <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((b,i) => {
                      const isEdit = bankEditId === b.id;
                      return (
                        <tr key={b.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e",opacity:b.active?1:0.5 }}>
                          <td style={{ padding:"10px 12px",fontWeight:"bold" }}>
                            {isEdit
                              ? <input value={bankForm.name} onChange={e => setBankForm(p => ({...p,name:e.target.value}))}
                                  style={{ ...inp,padding:"4px 8px",border:"1px solid #f0a500" }} />
                              : b.name}
                          </td>
                          <td style={{ padding:"10px 12px",color:"#888",fontSize:11,fontFamily:"monospace" }}>
                            {isEdit
                              ? <input value={bankForm.code} onChange={e => setBankForm(p => ({...p,code:e.target.value}))}
                                  placeholder="0102" style={{ ...inp,padding:"4px 8px",maxWidth:80 }} />
                              : b.code||<span style={{ color:"#444" }}>—</span>}
                          </td>
                          <td style={{ padding:"10px 12px",color:"#555",fontSize:11 }}>{b.journals_count??0}</td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:11,color:b.active?"#27ae60":"#e74c3c" }}>{b.active?"● Activo":"○ Inactivo"}</span>
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <div style={{ display:"flex",gap:6 }}>
                              {isEdit ? (
                                <>
                                  <button onClick={saveBank} disabled={bankSaving} style={{ ...btnSmall,color:"#27ae60",borderColor:"#27ae60" }}>✓ Guardar</button>
                                  <button onClick={() => { setBankEditId(null); setBankForm(EMPTY_BANK); }} style={btnSmall}>✕</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setBankEditId(b.id); setBankForm({ name:b.name,code:b.code||"",sort_order:b.sort_order??0 }); }}
                                    style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Editar</button>
                                  <button onClick={() => toggleBank(b)} style={{ ...btnSmall,color:b.active?"#e74c3c":"#27ae60",borderColor:b.active?"#e74c3c":"#27ae60" }}>
                                    {b.active?"Desact.":"Activar"}
                                  </button>
                                  <button onClick={() => removeBank(b)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {!bankEditId && (
            <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
              <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>+ NUEVO BANCO</div>
              <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr 80px auto",gap:10,alignItems:"end" }}>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nombre *</div>
                  <input value={bankForm.name} onChange={e => setBankForm(p => ({...p,name:e.target.value}))}
                    placeholder="ej. Banco de Venezuela" style={inp} onKeyDown={e => e.key==="Enter" && saveBank()} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Código</div>
                  <input value={bankForm.code} onChange={e => setBankForm(p => ({...p,code:e.target.value}))}
                    placeholder="ej. 0102" style={inp} onKeyDown={e => e.key==="Enter" && saveBank()} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Orden</div>
                  <input type="number" value={bankForm.sort_order} onChange={e => setBankForm(p => ({...p,sort_order:parseInt(e.target.value)||0}))} style={inp} />
                </div>
                <button onClick={saveBank} disabled={bankSaving}
                  style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 20px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
                  {bankSaving?"...":"Crear"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TIPOS DE PAGO
      ══════════════════════════════════════════════════════ */}
      {subPage === "Tipos de pago" && (
        <div style={{ maxWidth:900 }}>
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18,marginBottom:20 }}>
            <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:4 }}>MÉTODOS DE PAGO</div>
            <div style={{ fontSize:11,color:"#555",marginBottom:16 }}>El código no se puede cambiar una vez creado — es clave histórica en ventas.</div>
            {paymentMethods.length === 0
              ? <div style={{ textAlign:"center",color:"#444",padding:"24px 0",fontSize:12 }}>Sin métodos configurados.</div>
              : <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:"2px solid #f0a500",color:"#f0a500" }}>
                      {["","Nombre","Código","Ventas","Estado","Acciones"].map(h =>
                        <th key={h} style={{ textAlign:"left",padding:"8px 12px",fontSize:11,letterSpacing:1 }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((m,i) => {
                      const isEdit = methodEditId === m.id;
                      return (
                        <tr key={m.id} style={{ background:i%2===0?"#111":"transparent",borderBottom:"1px solid #1e1e1e",opacity:m.active?1:0.5 }}>
                          <td style={{ padding:"8px 12px",width:60 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                              {isEdit
                                ? <input type="color" value={methodForm.color} onChange={e => setMethodForm(p => ({...p,color:e.target.value}))}
                                    style={{ width:28,height:28,padding:2,background:"#0f0f0f",border:"1px solid #333",borderRadius:3,cursor:"pointer" }} />
                                : <div style={{ width:10,height:10,borderRadius:"50%",background:m.color||"#555" }} />
                              }
                              {isEdit
                                ? <input value={methodForm.icon} onChange={e => setMethodForm(p => ({...p,icon:e.target.value}))}
                                    style={{ ...inp,padding:"4px 6px",width:44,textAlign:"center",fontSize:16 }} />
                                : <span style={{ fontSize:16 }}>{m.icon||"💳"}</span>
                              }
                            </div>
                          </td>
                          <td style={{ padding:"10px 12px",fontWeight:"bold" }}>
                            {isEdit
                              ? <input value={methodForm.name} onChange={e => setMethodForm(p => ({...p,name:e.target.value}))}
                                  style={{ ...inp,padding:"4px 8px",border:"1px solid #f0a500" }} />
                              : m.name}
                          </td>
                          <td style={{ padding:"10px 12px",color:"#888",fontSize:11,fontFamily:"monospace" }}>
                            <span style={{ background:"#111",border:"1px solid #2a2a2a",padding:"2px 7px",borderRadius:3 }}>{m.code}</span>
                          </td>
                          <td style={{ padding:"10px 12px",color:"#555",fontSize:11 }}>{m.sales_count??0}</td>
                          <td style={{ padding:"10px 12px" }}>
                            <span style={{ fontSize:11,color:m.active?"#27ae60":"#e74c3c" }}>{m.active?"● Activo":"○ Inactivo"}</span>
                          </td>
                          <td style={{ padding:"10px 12px" }}>
                            <div style={{ display:"flex",gap:6 }}>
                              {isEdit ? (
                                <>
                                  <button onClick={saveMethod} disabled={methodSaving} style={{ ...btnSmall,color:"#27ae60",borderColor:"#27ae60" }}>✓ Guardar</button>
                                  <button onClick={() => { setMethodEditId(null); setMethodForm(EMPTY_METHOD); }} style={btnSmall}>✕</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setMethodEditId(m.id); setMethodForm({ name:m.name,code:m.code,icon:m.icon||"💳",color:m.color||"#555555",sort_order:m.sort_order??0 }); }}
                                    style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>Editar</button>
                                  <button onClick={() => toggleMethod(m)} style={{ ...btnSmall,color:m.active?"#e74c3c":"#27ae60",borderColor:m.active?"#e74c3c":"#27ae60" }}>
                                    {m.active?"Desact.":"Activar"}
                                  </button>
                                  <button onClick={() => removeMethod(m)} style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>Eliminar</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {!methodEditId && (
            <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:18 }}>
              <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2,marginBottom:14 }}>+ NUEVO MÉTODO DE PAGO</div>
              <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr 52px 52px 70px auto",gap:10,alignItems:"end" }}>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Nombre *</div>
                  <input value={methodForm.name} onChange={e => setMethodForm(p => ({...p,name:e.target.value}))}
                    placeholder="ej. Pago Móvil" style={inp} onKeyDown={e => e.key==="Enter" && saveMethod()} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Código * <span style={{ color:"#444",fontSize:10 }}>(inmutable)</span></div>
                  <input value={methodForm.code} onChange={e => setMethodForm(p => ({...p,code:e.target.value}))}
                    placeholder="pago_movil" style={inp} onKeyDown={e => e.key==="Enter" && saveMethod()} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Ícono</div>
                  <input value={methodForm.icon} onChange={e => setMethodForm(p => ({...p,icon:e.target.value}))}
                    style={{ ...inp,textAlign:"center",fontSize:18 }} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Color</div>
                  <input type="color" value={methodForm.color} onChange={e => setMethodForm(p => ({...p,color:e.target.value}))}
                    style={{ width:"100%",height:38,padding:3,background:"#0f0f0f",border:"1px solid #333",borderRadius:4,cursor:"pointer",boxSizing:"border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>Orden</div>
                  <input type="number" value={methodForm.sort_order} onChange={e => setMethodForm(p => ({...p,sort_order:parseInt(e.target.value)||0}))} style={inp} />
                </div>
                <button onClick={saveMethod} disabled={methodSaving}
                  style={{ background:"#f0a500",color:"#0f0f0f",border:"none",padding:"8px 20px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:13,whiteSpace:"nowrap" }}>
                  {methodSaving?"...":"Crear"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}