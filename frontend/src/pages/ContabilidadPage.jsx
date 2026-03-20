import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ReceiptModal from "../components/ReceiptModal";
import PaymentFormModal from "../components/PaymentFormModal";

const fmt = (n, symbol = "$") => `${symbol}${Number(n).toFixed(2)}`;

const EMPTY_JOURNAL = { name:"", type:"", bank_id:"", color:"#555555", currency_id:"" };
const EMPTY_BANK    = { name:"", code:"", sort_order:0 };
const EMPTY_METHOD  = { name:"", code:"", icon:"💳", color:"#555555", sort_order:0 };

const SUB_PAGES = ["Transacciones", "Pagos", "Series", "Diarios", "Tipos de pago", "Bancos"];

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

// ── Balance por diario (suma payments) ────────────────────────
function JournalSummary({ dateFrom, dateTo, onData }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    api.journals.getSummary(params).then(r => {
      setData(r.data);
      onData?.(r.data);
    }).catch(() => {});
  }, [dateFrom, dateTo]);
  if (!data.length) return <div style={{ color:"#555",fontSize:12 }}>Sin datos</div>;
  return (
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
            {j.bank_name && <div style={{ fontSize:10,color:"#555",marginBottom:6 }}>🏦 {j.bank_name}</div>}
            <div style={{ fontSize:20,fontWeight:"bold",color:j.color||"#f0a500" }}>{fmtJ(j.total_ingresos)}</div>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
              <span style={{ fontSize:10,color:"#555" }}>{j.tx_count} transac.</span>
              <span style={{ fontSize:10,color:"#27ae60" }}>Hoy: {fmtJ(j.ingresos_hoy)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ContabilidadPage() {
  const {
    notify, can,
    journals, loadJournals,
    currencies, activeCurrencies, baseCurrency,
    banks, loadBanks,
    paymentMethods, loadPaymentMethods,
  } = useApp();

  const activeMethods = paymentMethods.filter(m => m.active);
  const activeBanks   = banks.filter(b => b.active);
  const methodByCode  = Object.fromEntries(paymentMethods.map(m => [m.code, m]));

  const fmtPrice = n => fmt(n, baseCurrency?.symbol || "$");

  // Formatea un monto según la moneda de la venta (convierte si es no-base)
  const fmtSale = (sale, amount) => {
    const isBase = !sale.currency_id || sale.currency_id === baseCurrency?.id;
    if (isBase) return fmtPrice(amount);
    const sym  = sale.currency_symbol || "Bs.";
    const rate = parseFloat(sale.exchange_rate) || 1;
    return `${sym}${(parseFloat(amount || 0) * rate).toFixed(2)}`;
  };

  // Formatea un pago en la moneda con que fue realizado (amount está en base, × exchange_rate = moneda del pago)
  const fmtPayment = pay => {
    const isBase = !pay.currency_code || pay.currency_code === baseCurrency?.code;
    if (isBase) return fmtPrice(pay.amount);
    const sym  = pay.currency_symbol || "Bs.";
    const rate = parseFloat(pay.exchange_rate) || 1;
    return `${sym}${(parseFloat(pay.amount || 0) * rate).toFixed(2)}`;
  };

  // ── Dropdown hover ─────────────────────────────────────────
  const [subPage, setSubPage]   = useState("Transacciones");
  const [dropOpen, setDropOpen] = useState(false);

  // ══════════════════════════════════════════════════════════
  // TRANSACCIONES
  // ══════════════════════════════════════════════════════════
  const [sales,          setSales]          = useState([]);
  const [histDateFrom,   setHistDateFrom]   = useState("");
  const [histDateTo,     setHistDateTo]     = useState("");
  const [filterSerieId,  setFilterSerieId]  = useState(null);
  const [filterStatus,   setFilterStatus]   = useState(null);
  const [saleDetail,     setSaleDetail]     = useState(null);
  const [receiptSale,    setReceiptSale]    = useState(null);
  const [summaryView,      setSummaryView]      = useState("diarios");
  const [journalSummData,  setJournalSummData]  = useState([]);

  const loadSales = useCallback(async () => {
    try {
      const params = {};
      if (histDateFrom)  params.date_from = histDateFrom;
      if (histDateTo)    params.date_to   = histDateTo;
      if (filterSerieId) params.serie_id  = filterSerieId;
      if (filterStatus)  params.status    = filterStatus;
      const r = await api.sales.getAll(params);
      setSales(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [histDateFrom, histDateTo, filterSerieId, filterStatus, notify]);

  useEffect(() => { loadSales(); }, [loadSales]);

  const cancelSale = async (id) => {
    if (!confirm("¿Anular esta venta? Se restaurará el stock.")) return;
    try { await api.sales.cancel(id); notify("Venta anulada ✓"); loadSales(); }
    catch (e) { notify(e.message, "err"); }
  };

  // ══════════════════════════════════════════════════════════
  // PAGOS CLIENTES
  // ══════════════════════════════════════════════════════════
  const [payStats,       setPayStats]       = useState(null);
  const [pendingSales,   setPendingSales]   = useState([]);
  const [payments,       setPayments]       = useState([]);
  const [payDateFrom,    setPayDateFrom]    = useState("");
  const [payDateTo,      setPayDateTo]      = useState("");
  const [payDetail,      setPayDetail]      = useState(null);
  const [payModal,       setPayModal]       = useState(null);   // sale que se va a pagar
  const [payView,        setPayView]        = useState("pendientes"); // "pendientes" | "historial"

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

  useEffect(() => { if (subPage === "Pagos") loadPayments(); }, [subPage, loadPayments]);

  const removePayment = async (payId) => {
    if (!window.confirm("¿Eliminar este pago? El estado de la factura se recalculará.")) return;
    try {
      await api.payments.remove(payId);
      notify("Pago eliminado");
      loadPayments();
    } catch (e) { notify(e.message, "err"); }
  };

  // ══════════════════════════════════════════════════════════
  // SERIES
  // ══════════════════════════════════════════════════════════
  const EMPTY_SERIE = { name:"", prefix:"", padding:4 };
  const EMPTY_RANGE = { start_number:"", end_number:"" };

  const [allSeries,     setAllSeries]     = useState([]);
  const [serieForm,     setSerieForm]     = useState(EMPTY_SERIE);
  const [editSerie,     setEditSerie]     = useState(null);
  const [expandSerie,   setExpandSerie]   = useState(null); // id de serie expandida
  const [rangeForm,     setRangeForm]     = useState(EMPTY_RANGE);
  const [savingSerie,   setSavingSerie]   = useState(false);
  const [allEmployees,  setAllEmployees]  = useState([]);

  const loadAllSeries = useCallback(async () => {
    try {
      const r = await api.series.getAll();
      setAllSeries(r.data || []);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  useEffect(() => {
    if (subPage === "Series") {
      loadAllSeries();
      api.employees.getAll().then(r => setAllEmployees(r.data || [])).catch(() => {});
    }
  }, [subPage, loadAllSeries]);

  const saveSerie = async () => {
    if (!serieForm.name || !serieForm.prefix) return notify("Nombre y prefijo son requeridos", "err");
    setSavingSerie(true);
    try {
      if (editSerie) {
        await api.series.update(editSerie.id, serieForm);
        notify("Serie actualizada ✓"); setEditSerie(null);
      } else {
        await api.series.create(serieForm);
        notify("Serie creada ✓");
      }
      setSerieForm(EMPTY_SERIE); loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
    setSavingSerie(false);
  };

  const deleteSerie = async (id) => {
    if (!confirm("¿Eliminar esta serie y todos sus rangos?")) return;
    try { await api.series.remove(id); notify("Serie eliminada"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const addRange = async (serieId) => {
    if (!rangeForm.start_number || !rangeForm.end_number) return notify("Inicio y fin son requeridos", "err");
    try {
      await api.series.addRange(serieId, rangeForm);
      notify("Rango añadido ✓"); setRangeForm(EMPTY_RANGE); loadAllSeries();
    } catch (e) { notify(e.message, "err"); }
  };

  const deleteRange = async (rangeId) => {
    if (!confirm("¿Eliminar este rango?")) return;
    try { await api.series.removeRange(rangeId); notify("Rango eliminado"); loadAllSeries(); }
    catch (e) { notify(e.message, "err"); }
  };

  const toggleUserSerie = async (serie, userId) => {
    const current = (serie.Employees || []).map(e => e.id);
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    try { await api.series.assignUsers(serie.id, { user_ids: updated }); loadAllSeries(); }
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
          {/* ── Filtros estilo Odoo ── */}
          <div style={{ background:"#111",border:"1px solid #222",borderRadius:6,padding:"12px 16px",marginBottom:16 }}>
            {/* Fila de inputs */}
            <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10 }}>
              <span style={{ fontSize:10,color:"#555",letterSpacing:1,whiteSpace:"nowrap" }}>FECHA</span>
              <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
                style={{ background:"#0f0f0f",border:"1px solid #333",color:"#e8e0d0",padding:"5px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
              <span style={{ color:"#444" }}>→</span>
              <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
                style={{ background:"#0f0f0f",border:"1px solid #333",color:"#e8e0d0",padding:"5px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
              {(histDateFrom||histDateTo||filterSerieId||filterStatus) && (
                <button onClick={() => { setHistDateFrom(""); setHistDateTo(""); setFilterSerieId(null); setFilterStatus(null); }}
                  style={{ marginLeft:"auto",...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>✕ Limpiar filtros</button>
              )}
            </div>
            {/* Chips: Serie */}
            {allSeries.length > 0 && (
              <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:6 }}>
                <span style={{ fontSize:10,color:"#555",letterSpacing:1,minWidth:52 }}>SERIE</span>
                {allSeries.map(s => (
                  <button key={s.id} onClick={() => setFilterSerieId(filterSerieId===s.id ? null : s.id)}
                    style={{ padding:"3px 10px",borderRadius:12,fontFamily:"inherit",fontSize:11,cursor:"pointer",fontWeight:"bold",
                      background: filterSerieId===s.id ? "#f0a500" : "#1a1a1a",
                      color:      filterSerieId===s.id ? "#000" : "#888",
                      border:     filterSerieId===s.id ? "1px solid #f0a500" : "1px solid #333",
                    }}>{s.prefix} — {s.name}</button>
                ))}
              </div>
            )}
            {/* Chips: Estado */}
            <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
              <span style={{ fontSize:10,color:"#555",letterSpacing:1,minWidth:52 }}>ESTADO</span>
              {[
                { key:"pendiente", label:"Pendiente", color:"#e74c3c" },
                { key:"parcial",   label:"Parcial",   color:"#f0a500" },
                { key:"pagado",    label:"Pagado",    color:"#27ae60" },
                { key:"anulado",   label:"Anulado",   color:"#555"    },
              ].map(({ key, label, color }) => (
                <button key={key} onClick={() => setFilterStatus(filterStatus===key ? null : key)}
                  style={{ padding:"3px 10px",borderRadius:12,fontFamily:"inherit",fontSize:11,cursor:"pointer",fontWeight:"bold",
                    background: filterStatus===key ? color : "#1a1a1a",
                    color:      filterStatus===key ? "#fff" : "#888",
                    border:     filterStatus===key ? `1px solid ${color}` : "1px solid #333",
                  }}>{label}</button>
              ))}
            </div>
          </div>

          {/* ── Cards de balance ── */}
          <div style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"14px 16px",marginBottom:16 }}>
            <div style={{ display:"flex",gap:0,marginBottom:12,borderBottom:"1px solid #2a2a2a" }}>
              {[["diarios","Diarios"],["bancos","Bancos"],["series","Series"]].map(([k,l]) => (
                <button key={k} onClick={() => setSummaryView(k)}
                  style={{ background:"transparent",border:"none",borderBottom:summaryView===k?"2px solid #f0a500":"2px solid transparent",color:summaryView===k?"#f0a500":"#555",padding:"4px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:summaryView===k?"bold":"normal",letterSpacing:1,marginBottom:-1 }}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {summaryView === "diarios" && <JournalSummary dateFrom={histDateFrom} dateTo={histDateTo} onData={setJournalSummData} />}
            {summaryView === "bancos" && (() => {
              // Agrupar el summary de diarios por banco
              const byBank = {};
              journalSummData.forEach(j => {
                const key = j.bank_name || "Sin banco";
                const sym = j.currency_symbol || "$";
                if (!byBank[key]) byBank[key] = { journals:[], sym };
                byBank[key].journals.push(j);
              });
              const entries = Object.entries(byBank);
              if (!entries.length) return <div style={{ color:"#555",fontSize:12 }}>Sin datos</div>;
              return (
                <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                  {entries.map(([bank, d]) => {
                    const totalPagos = d.journals.reduce((s,j) => s + parseFloat(j.total_ingresos||0), 0);
                    const countPagos = d.journals.reduce((s,j) => s + parseInt(j.tx_count||0), 0);
                    const hoy        = d.journals.reduce((s,j) => s + parseFloat(j.ingresos_hoy||0), 0);
                    // Mostrar en la moneda del primer diario del banco (o $ si mezcla)
                    const sym = d.journals.length === 1 ? (d.journals[0].currency_symbol || "$") : "$";
                    const fmtB = n => `${sym}${Number(n).toFixed(2)}`;
                    return (
                      <div key={bank} style={{ background:"#111",border:"1px solid #333",borderRadius:8,padding:"10px 16px",minWidth:180 }}>
                        <div style={{ fontSize:12,fontWeight:"bold",color:"#e8e0d0",marginBottom:4 }}>🏦 {bank}</div>
                        <div style={{ fontSize:10,color:"#555",marginBottom:6 }}>{d.journals.map(j=>j.name).join(", ")}</div>
                        <div style={{ fontSize:20,fontWeight:"bold",color:"#f0a500" }}>{fmtB(totalPagos)}</div>
                        <div style={{ display:"flex",justifyContent:"space-between",marginTop:4 }}>
                          <span style={{ fontSize:10,color:"#555" }}>{countPagos} pagos</span>
                          <span style={{ fontSize:10,color:"#27ae60" }}>Hoy: {fmtB(hoy)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {summaryView === "series" && (() => {
              const bySerie = {};
              sales.forEach(s => {
                const key = s.serie_name || "Sin serie";
                if (!bySerie[key]) bySerie[key] = { count:0, total:0 };
                bySerie[key].count++;
                bySerie[key].total += parseFloat(s.total||0);
              });
              const entries = Object.entries(bySerie);
              if (!entries.length) return <div style={{ color:"#555",fontSize:12 }}>Sin datos</div>;
              return (
                <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                  {entries.map(([serie, d]) => (
                    <div key={serie} style={{ background:"#111",border:"1px solid #f0a50033",borderRadius:8,padding:"10px 16px",minWidth:160 }}>
                      <div style={{ fontSize:12,fontWeight:"bold",color:"#f0a500",marginBottom:6 }}>{serie}</div>
                      <div style={{ fontSize:20,fontWeight:"bold",color:"#e8e0d0" }}>{fmtPrice(d.total)}</div>
                      <div style={{ fontSize:10,color:"#555",marginTop:4 }}>{d.count} facturas</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Lista ventas */}
          {sales.length === 0
            ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0" }}>Sin ventas en este período</div>
            : sales.map(sale => (
              <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:16,marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8,flexWrap:"wrap" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:11,color:"#555",fontWeight:"bold" }}>{sale.invoice_number || `#${sale.id}`}</span>
                    {sale.status === "pagado"
                      ? <span style={{ fontSize:9,background:"#27ae6022",color:"#27ae60",border:"1px solid #27ae6044",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PAGADO</span>
                      : sale.status === "parcial"
                        ? <span style={{ fontSize:9,background:"#f0a50022",color:"#f0a500",border:"1px solid #f0a50044",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PARCIAL</span>
                        : <span style={{ fontSize:9,background:"#e74c3c22",color:"#e74c3c",border:"1px solid #e74c3c44",padding:"1px 6px",borderRadius:3,letterSpacing:1 }}>PENDIENTE</span>
                    }
                    {sale.journal_name && (
                      <span style={{ fontSize:10,background:(sale.journal_color||"#555")+"22",color:sale.journal_color||"#888",border:`1px solid ${(sale.journal_color||"#555")}44`,padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4 }}>
                        <div style={{ width:6,height:6,borderRadius:"50%",background:sale.journal_color||"#555" }} />{sale.journal_name}
                      </span>
                    )}
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
                    <button onClick={() => setReceiptSale(sale)}
                      style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>
                      🧾 Factura
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
                            <td style={{ padding:"5px 8px",textAlign:"right",color:"#f0a500",fontWeight:"bold" }}>{fmtPrice(item.subtotal ?? parseFloat(item.price||0)*parseFloat(item.quantity||1))}</td>
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
                        <tr>
                          <td colSpan={3} style={{ padding:"3px 8px",textAlign:"right",color:"#888",fontSize:11 }}>PAGADO</td>
                          <td style={{ padding:"3px 8px",textAlign:"right",color:"#27ae60",fontWeight:"bold" }}>{fmtPrice(sale.amount_paid ?? 0)}</td>
                        </tr>
                        {sale.status !== 'pagado' && (
                          <tr>
                            <td colSpan={3} style={{ padding:"3px 8px",textAlign:"right",color:"#e74c3c",fontSize:11 }}>SALDO</td>
                            <td style={{ padding:"3px 8px",textAlign:"right",color:"#e74c3c",fontWeight:"bold" }}>{fmtPrice(sale.balance ?? 0)}</td>
                          </tr>
                        )}
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
          PAGOS CLIENTES
      ══════════════════════════════════════════════════════ */}
      {subPage === "Pagos" && (
        <div>
          {/* Stats */}
          {payStats && (
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 }}>
              {[
                ["PENDIENTES",    payStats.pending_invoices,  "#e74c3c"],
                ["PARCIALES",     payStats.parcial_invoices,  "#f0a500"],
                ["COBRADAS",      payStats.paid_invoices,     "#27ae60"],
                ["TOTAL COBRADO", fmtPrice(payStats.total_amount), "#5dade2"],
              ].map(([label,val,color]) => (
                <div key={label} style={{ background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"14px 16px" }}>
                  <div style={{ fontSize:10,color:"#555",letterSpacing:1,marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:18,fontWeight:"bold",color }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sub-vista: Pendientes / Historial */}
          <div style={{ display:"flex",gap:0,marginBottom:16,borderBottom:"1px solid #2a2a2a" }}>
            {["pendientes","historial"].map(v => (
              <button key={v} onClick={() => setPayView(v)}
                style={{ background:"transparent",color:payView===v?"#f0a500":"#555",border:"none",borderBottom:payView===v?"2px solid #f0a500":"2px solid transparent",padding:"6px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:payView===v?"bold":"normal",letterSpacing:1,marginBottom:-1 }}>
                {v === "pendientes" ? `PENDIENTES (${pendingSales.length})` : "HISTORIAL PAGOS"}
              </button>
            ))}
          </div>

          {/* ── PENDIENTES DE PAGO ── */}
          {payView === "pendientes" && (
            pendingSales.length === 0
              ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0" }}>No hay facturas pendientes de pago</div>
              : pendingSales.map(sale => (
                <div key={sale.id} style={{ background:"#1a1a1a",border:"1px solid #e74c3c44",borderRadius:6,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
                  {(() => {
                  const sc = sale.status === 'parcial' ? "#f0a500" : "#e74c3c";
                  const sl = sale.status === 'parcial' ? "PARCIAL"  : "PENDIENTE";
                  return <span style={{ background:sc+"22",color:sc,border:`1px solid ${sc}44`,padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:"bold",letterSpacing:1 }}>{sl}</span>;
                })()}
                  <div style={{ fontSize:11,color:"#f0a500",fontWeight:"bold" }}>{sale.invoice_number || `Factura #${sale.id}`}</div>

                  {sale.journal_name && (
                    <span style={{ fontSize:10,background:(sale.journal_color||"#555")+"22",color:sale.journal_color||"#888",border:`1px solid ${(sale.journal_color||"#555")}44`,padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4 }}>
                      <div style={{ width:6,height:6,borderRadius:"50%",background:sale.journal_color||"#555" }} />{sale.journal_name}
                    </span>
                  )}

                  {sale.customer_name && (
                    <span style={{ fontSize:11,color:"#5dade2" }}>
                      👤 {sale.customer_name}
                      {sale.customer_rif && <span style={{ color:"#666",fontSize:10 }}> · {sale.customer_rif}</span>}
                    </span>
                  )}

                  <div style={{ flex:1 }} />
                  <span style={{ fontSize:11,color:"#666" }}>{new Date(sale.created_at).toLocaleString("es-VE")}</span>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontWeight:"bold",color:"#f0a500",fontSize:15 }}>{fmtPrice(sale.total)}</div>
                    {sale.status === 'parcial' && sale.balance != null && (
                      <div style={{ fontSize:11,color:"#e74c3c" }}>Saldo: {fmtPrice(sale.balance)}</div>
                    )}
                  </div>

                  <button onClick={() => setPayReceiptSale(sale)} style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>🧾 Factura</button>
                  <button onClick={() => setPayModal(sale)}
                    style={{ ...btnSmall,color:"#27ae60",borderColor:"#27ae60",fontWeight:"bold" }}>
                    ✓ Registrar pago
                  </button>
                </div>
              ))
          )}

          {/* ── HISTORIAL DE PAGOS ── */}
          {payView === "historial" && (
            <div>
              <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap" }}>
                <div style={{ fontSize:11,color:"#555" }}>FILTRAR:</div>
                <input type="date" value={payDateFrom} onChange={e => setPayDateFrom(e.target.value)}
                  style={{ background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"6px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
                <span style={{ color:"#555" }}>→</span>
                <input type="date" value={payDateTo} onChange={e => setPayDateTo(e.target.value)}
                  style={{ background:"#1a1a1a",border:"1px solid #333",color:"#e8e0d0",padding:"6px 10px",borderRadius:4,fontFamily:"inherit",fontSize:12 }} />
                {(payDateFrom||payDateTo) && (
                  <button onClick={() => { setPayDateFrom(""); setPayDateTo(""); }}
                    style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c",padding:"5px 10px" }}>✕ Limpiar</button>
                )}
              </div>

              {payments.length === 0
                ? <div style={{ textAlign:"center",color:"#444",padding:"40px 0" }}>Sin pagos en este período</div>
                : payments.map(pay => (
                  <div key={pay.id} style={{ background:"#1a1a1a",border:"1px solid #27ae6044",borderRadius:6,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
                    <span style={{ background:"#27ae6022",color:"#27ae60",border:"1px solid #27ae6044",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:"bold",letterSpacing:1 }}>PAGADO</span>
                    <div style={{ fontSize:11,color:"#f0a500",fontWeight:"bold" }}>{pay.invoice_number || `Factura #${pay.sale_id}`}</div>

                    {pay.journal_name && (
                      <span style={{ fontSize:10,background:(pay.journal_color||"#555")+"22",color:pay.journal_color||"#888",border:`1px solid ${(pay.journal_color||"#555")}44`,padding:"2px 8px",borderRadius:3,display:"inline-flex",alignItems:"center",gap:4 }}>
                        <div style={{ width:6,height:6,borderRadius:"50%",background:pay.journal_color||"#555" }} />{pay.journal_name}
                      </span>
                    )}

                    {pay.customer_name && (
                      <span style={{ fontSize:11,color:"#5dade2" }}>
                        👤 {pay.customer_name}
                        {pay.customer_rif && <span style={{ color:"#666",fontSize:10 }}> · {pay.customer_rif}</span>}
                      </span>
                    )}

                    {pay.reference_number && (
                      <span style={{ fontSize:10,color:"#888",border:"1px solid #333",padding:"2px 8px",borderRadius:3 }}>
                        Ref: {pay.reference_number}
                      </span>
                    )}
                    {pay.reference_date && (
                      <span style={{ fontSize:10,color:"#666" }}>
                        Fecha ref: {new Date(pay.reference_date + "T00:00:00").toLocaleDateString("es-VE")}
                      </span>
                    )}

                    <div style={{ flex:1 }} />
                    <span style={{ fontSize:11,color:"#666" }}>{new Date(pay.created_at).toLocaleString("es-VE")}</span>
                    <span style={{ fontWeight:"bold",color:"#27ae60",fontSize:15 }}>{fmtPayment(pay)}</span>
                    <button onClick={() => setPayDetail(pay)}
                      style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>🧾 Detalle</button>
                    <button onClick={() => removePayment(pay.id)}
                      style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>🗑 Eliminar</button>
                  </div>
                ))
              }
            </div>
          )}

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
            const row    = (label, value, color) => (
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:13 }}>
                <span style={{ color:"#555" }}>{label}</span>
                <span style={{ color: color || "#e8e0d0", fontWeight: color ? "bold" : "normal" }}>{value}</span>
              </div>
            );
            return (
              <div onClick={() => setPayDetail(null)}
                style={{ position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.82)",
                         display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ background:"#1a1a1a",border:"1px solid #27ae60",borderRadius:8,
                           width:"100%",maxWidth:420,fontFamily:"'Courier New',monospace",
                           boxShadow:"0 8px 40px rgba(0,0,0,0.8)" }}>
                  <div style={{ padding:"14px 20px",borderBottom:"1px solid #2a2a2a",
                                display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div style={{ fontWeight:"bold",fontSize:13,color:"#27ae60",letterSpacing:2 }}>DETALLE DEL PAGO</div>
                    <button onClick={() => setPayDetail(null)}
                      style={{ background:"transparent",border:"none",color:"#555",fontSize:18,cursor:"pointer" }}>✕</button>
                  </div>
                  <div style={{ padding:20 }}>
                    {row("Factura",    p.invoice_number || `#${p.sale_id}`, "#f0a500")}
                    {p.customer_name && row("Cliente", p.customer_name, "#5dade2")}
                    {p.journal_name  && row("Diario",  p.journal_name)}
                    <div style={{ borderTop:"1px solid #2a2a2a",margin:"10px 0" }} />
                    {row("Monto cobrado", fmtP(p.amount), "#27ae60")}
                    {!isBase && row("Equivalente USD", fmtB(p.amount), "#888")}
                    {!isBase && row("Tasa del cobro", rate.toFixed(4), "#888")}
                    <div style={{ borderTop:"1px solid #2a2a2a",margin:"10px 0" }} />
                    {p.reference_number && row("N° Referencia", p.reference_number)}
                    {p.reference_date   && row("Fecha referencia", new Date(p.reference_date + "T00:00:00").toLocaleDateString("es-VE"))}
                    {row("Registrado el", new Date(p.created_at).toLocaleString("es-VE"))}
                    {p.notes && row("Notas", p.notes)}
                    <button onClick={() => setPayDetail(null)}
                      style={{ width:"100%",marginTop:16,background:"transparent",color:"#888",
                               border:"1px solid #333",padding:"10px",borderRadius:4,
                               cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>
                      CERRAR
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SERIES
      ══════════════════════════════════════════════════════ */}
      {subPage === "Series" && (
        <div>
          {/* Formulario nueva/editar serie */}
          <div style={{ background:"#111",border:"1px solid #222",borderRadius:6,padding:20,marginBottom:24 }}>
            <div style={{ fontWeight:"bold",fontSize:13,letterSpacing:2,marginBottom:16,color:"#f0a500" }}>
              {editSerie ? "EDITAR SERIE" : "NUEVA SERIE"}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>NOMBRE</div>
                <input value={editSerie ? editSerie.name : serieForm.name}
                  onChange={e => editSerie ? setEditSerie(p=>({...p,name:e.target.value})) : setSerieForm(p=>({...p,name:e.target.value}))}
                  placeholder="Ej: Serie A" style={{ ...inp }} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>PREFIJO</div>
                <input value={editSerie ? editSerie.prefix : serieForm.prefix}
                  onChange={e => editSerie ? setEditSerie(p=>({...p,prefix:e.target.value.toUpperCase()})) : setSerieForm(p=>({...p,prefix:e.target.value.toUpperCase()}))}
                  placeholder="Ej: A" style={{ ...inp }} maxLength={10} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>DÍGITOS</div>
                <input type="number" min={1} max={8}
                  value={editSerie ? editSerie.padding : serieForm.padding}
                  onChange={e => editSerie ? setEditSerie(p=>({...p,padding:parseInt(e.target.value)||4})) : setSerieForm(p=>({...p,padding:parseInt(e.target.value)||4}))}
                  style={{ ...inp }} />
              </div>
            </div>
            {(editSerie ? editSerie.prefix && editSerie.padding : serieForm.prefix && serieForm.padding) && (
              <div style={{ fontSize:11,color:"#555",marginBottom:12 }}>
                Vista previa: <span style={{ color:"#f0a500",fontWeight:"bold" }}>
                  {(editSerie||serieForm).prefix}-{String(1).padStart((editSerie||serieForm).padding,'0')}
                </span>
              </div>
            )}
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={saveSerie} disabled={savingSerie}
                style={{ background:"#27ae60",color:"#fff",border:"none",padding:"8px 18px",borderRadius:4,fontFamily:"inherit",fontWeight:"bold",cursor:"pointer",fontSize:12 }}>
                {savingSerie ? "GUARDANDO..." : editSerie ? "ACTUALIZAR" : "CREAR SERIE"}
              </button>
              {editSerie && (
                <button onClick={() => { setEditSerie(null); setSerieForm(EMPTY_SERIE); }}
                  style={{ background:"transparent",border:"1px solid #333",color:"#888",padding:"8px 14px",borderRadius:4,fontFamily:"inherit",cursor:"pointer",fontSize:12 }}>
                  CANCELAR
                </button>
              )}
            </div>
          </div>

          {/* Lista de series */}
          {allSeries.map(serie => (
            <div key={serie.id} style={{ background:"#111",border:"1px solid #222",borderRadius:6,marginBottom:16 }}>
              {/* Header */}
              <div style={{ display:"flex",alignItems:"center",gap:12,padding:"14px 18px",borderBottom:expandSerie===serie.id?"1px solid #222":"none" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontWeight:"bold",fontSize:16,color:"#f0a500" }}>{serie.prefix}</span>
                    <span style={{ color:"#e8e0d0",fontWeight:"bold" }}>{serie.name}</span>
                    <span style={{ fontSize:10,background:"#1a1a1a",border:"1px solid #333",color:"#555",padding:"2px 6px",borderRadius:3 }}>
                      {serie.padding} dígitos
                    </span>
                    {!serie.active && <span style={{ fontSize:10,background:"#e74c3c22",color:"#e74c3c",padding:"2px 6px",borderRadius:3 }}>INACTIVA</span>}
                  </div>
                  <div style={{ fontSize:11,color:"#555",marginTop:2 }}>
                    {(serie.SerieRanges||[]).filter(r=>r.active).length} rango(s) activo(s) · {(serie.Employees||[]).length} usuario(s)
                  </div>
                </div>
                <button onClick={() => { setEditSerie({...serie}); setExpandSerie(null); }}
                  style={{ ...btnSmall }}>Editar</button>
                <button onClick={() => setExpandSerie(expandSerie===serie.id ? null : serie.id)}
                  style={{ ...btnSmall,color:"#f0a500",borderColor:"#f0a500" }}>
                  {expandSerie===serie.id ? "▲ Cerrar" : "▼ Gestionar"}
                </button>
                <button onClick={() => deleteSerie(serie.id)}
                  style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c" }}>✕</button>
              </div>

              {/* Panel expandido */}
              {expandSerie === serie.id && (
                <div style={{ padding:"16px 18px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
                  {/* Rangos */}
                  <div>
                    <div style={{ fontWeight:"bold",fontSize:11,letterSpacing:2,marginBottom:10,color:"#888" }}>RANGOS DE CORRELATIVOS</div>
                    {(serie.SerieRanges||[]).map(r => (
                      <div key={r.id} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6,background:"#0f0f0f",border:"1px solid #1a1a1a",borderRadius:4,padding:"8px 10px" }}>
                        <div style={{ flex:1 }}>
                          <span style={{ fontWeight:"bold",color: r.active?"#27ae60":"#555" }}>
                            {serie.prefix}-{String(r.start_number).padStart(serie.padding,'0')}
                          </span>
                          <span style={{ color:"#555",margin:"0 6px" }}>→</span>
                          <span style={{ fontWeight:"bold",color: r.active?"#27ae60":"#555" }}>
                            {serie.prefix}-{String(r.end_number).padStart(serie.padding,'0')}
                          </span>
                          {r.active && (
                            <span style={{ marginLeft:8,fontSize:10,color:"#555" }}>
                              (actual: {serie.prefix}-{String(r.current_number).padStart(serie.padding,'0')})
                            </span>
                          )}
                          {!r.active && <span style={{ marginLeft:8,fontSize:10,color:"#e74c3c" }}>AGOTADO</span>}
                        </div>
                        <button onClick={() => deleteRange(r.id)}
                          style={{ ...btnSmall,color:"#e74c3c",borderColor:"#e74c3c",padding:"2px 6px" }}>✕</button>
                      </div>
                    ))}
                    {/* Añadir rango */}
                    <div style={{ display:"flex",gap:8,marginTop:10 }}>
                      <input type="number" placeholder="Inicio" value={rangeForm.start_number}
                        onChange={e => setRangeForm(p=>({...p,start_number:e.target.value}))}
                        style={{ ...inp,width:80 }} />
                      <input type="number" placeholder="Fin" value={rangeForm.end_number}
                        onChange={e => setRangeForm(p=>({...p,end_number:e.target.value}))}
                        style={{ ...inp,width:80 }} />
                      <button onClick={() => addRange(serie.id)}
                        style={{ background:"#27ae60",color:"#fff",border:"none",padding:"6px 12px",borderRadius:4,fontFamily:"inherit",fontSize:11,fontWeight:"bold",cursor:"pointer" }}>
                        + Añadir
                      </button>
                    </div>
                  </div>

                  {/* Usuarios asignados */}
                  <div>
                    <div style={{ fontWeight:"bold",fontSize:11,letterSpacing:2,marginBottom:10,color:"#888" }}>USUARIOS ASIGNADOS</div>
                    {allEmployees.map(emp => {
                      const assigned = (serie.Employees||[]).some(e => e.id === emp.id);
                      return (
                        <div key={emp.id} onClick={() => toggleUserSerie(serie, emp.id)}
                          style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:4,marginBottom:4,cursor:"pointer",background:assigned?"#1a2e1a":"#0f0f0f",border:`1px solid ${assigned?"#27ae60":"#1a1a1a"}` }}>
                          <div style={{ width:14,height:14,borderRadius:3,border:"2px solid",borderColor:assigned?"#27ae60":"#333",background:assigned?"#27ae60":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                            {assigned && <span style={{ color:"#000",fontSize:9,fontWeight:"bold" }}>✓</span>}
                          </div>
                          <span style={{ fontSize:12,color:assigned?"#e8e0d0":"#555" }}>{emp.full_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          {allSeries.length === 0 && (
            <div style={{ textAlign:"center",padding:40,color:"#555" }}>No hay series configuradas</div>
          )}
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

      <ReceiptModal
        open={!!receiptSale}
        onClose={() => setReceiptSale(null)}
        sale={receiptSale}
      />
    </div>
  );
}