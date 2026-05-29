import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ReceiptModal from "../components/ReceiptModal";
import { fmtBase, fmtSale as fmtSaleHelper, fmtPayment as fmtPaymentHelper } from "../helpers";


// Sub-components
import EstadoCuentaTab from "../components/Contabilidad/EstadoCuentaTab";
import IngresosTab from "../components/Contabilidad/IngresosTab";
import TransaccionesTab from "../components/Contabilidad/TransaccionesTab";
import PagosTab from "../components/Contabilidad/PagosTab";
import SeriesTab from "../components/Contabilidad/SeriesTab";
import DiariosTab from "../components/Contabilidad/DiariosTab";
import BancosTab from "../components/Contabilidad/BancosTab";
import MetodosTab from "../components/Contabilidad/MetodosTab";
import EgresosTab from "../components/Contabilidad/EgresosTab";
import CotizacionesTab from "../components/Contabilidad/CotizacionesTab";
import NotasCreditoTab from "../components/Contabilidad/NotasCreditoTab";

const SUB_PAGES = ["Estado de Cuenta", "Ingresos", "Egresos", "Facturas", "Notas de Crédito", "Cotizaciones", "Pagos", "Series", "Diarios", "Tipos de pago", "Bancos"];

export default function ContabilidadPage() {
 const {
 notify, can,
 journals, loadJournals,
 currencies, baseCurrency,
 banks, loadBanks,
 paymentMethods, loadPaymentMethods,
 pendingAction, setPendingAction,
 } = useApp();

 const [allSeries, setAllSeries] = useState([]);
 const [allEmployees, setAllEmployees] = useState([]);

 const loadAllSeries = useCallback(async () => {
 try {
 const r = await api.series.getAll();
 setAllSeries(r.data);
 } catch (e) { notify(e.message, "err"); }
 }, [notify]);

 const loadAllEmployees = useCallback(async () => {
 try {
 const r = await api.employees.getAll();
 setAllEmployees(r.data);
 } catch (e) { notify(e.message, "err"); }
 }, [notify]);

 const canConfig = can("config");

 useEffect(() => {
 if (!canConfig) return;
 loadAllSeries();
 loadAllEmployees();
 }, [canConfig, loadAllSeries, loadAllEmployees]);

 const [subPage, setSubPage] = useState("Estado de Cuenta");
 const [openGroup, setOpenGroup] = useState(null);
 const navRef = useRef(null);

 useEffect(() => {
   const handler = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null); };
   document.addEventListener("mousedown", handler);
   return () => document.removeEventListener("mousedown", handler);
 }, []);

 useEffect(() => {
   if (!pendingAction?.startsWith("contabilidad:")) return;
   const target = pendingAction.slice("contabilidad:".length);
   if (SUB_PAGES.includes(target)) setSubPage(target);
   setPendingAction(null);
 }, [pendingAction]);
 const [receiptSale, setReceiptSale] = useState(null);

 const fmtPrice = (n) => fmtBase(n, baseCurrency);
 const fmtSale = (sale, amt) => fmtSaleHelper(sale, amt, baseCurrency);
 const fmtPayment = (pay) => fmtPaymentHelper(pay, baseCurrency);

 const activeMethods = paymentMethods.filter(m => m.active);
 const activeBanks = banks.filter(b => b.active);
 const methodByCode = Object.fromEntries(paymentMethods.map(m => [m.code, m]));
 const NAV_GROUPS = [
   { label: "Movimientos", items: ["Estado de Cuenta", "Ingresos", "Egresos"] },
   { label: "Ventas",      items: ["Facturas", "Notas de Crédito", "Cotizaciones"] },
   { label: "Pagos",       items: null },
   ...(canConfig ? [{ label: "Configuración", items: ["Series", "Tipos de pago", "Bancos", "Diarios"] }] : []),
 ];

 const visibleSubPages = NAV_GROUPS.flatMap(g => g.items ?? [g.label]);

 useEffect(() => {
   if (!visibleSubPages.includes(subPage)) setSubPage(visibleSubPages[0] || "Estado de Cuenta");
 }, [subPage, visibleSubPages]);

 const renderContent = () => {
 switch (subPage) {
 case "Estado de Cuenta":
 return <EstadoCuentaTab />;
 case "Ingresos":
 return (
 <IngresosTab
 notify={notify}
 can={can}
 fmtPrice={fmtPrice}
 journals={journals}
 />
 );
 case "Egresos":
 return (
 <EgresosTab
 notify={notify}
 can={can}
 fmtPrice={fmtPrice}
 journals={journals}
 />
 );
 case "Facturas":
 return (
 <TransaccionesTab
 notify={notify}
 can={can}
 baseCurrency={baseCurrency}
 fmtPrice={fmtPrice}
 fmtSale={fmtSale}
 allSeries={allSeries}
 setReceiptSale={setReceiptSale}
 />
 );
 case "Notas de Crédito":
 return (
 <NotasCreditoTab
 notify={notify}
 fmtPrice={fmtPrice}
 />
 );
 case "Cotizaciones":
 return (
 <CotizacionesTab
 notify={notify}
 can={can}
 fmtPrice={fmtPrice}
 allSeries={allSeries}
 />
 );
 case "Pagos":
 return (
 <PagosTab
 notify={notify}
 can={can}
 baseCurrency={baseCurrency}
 fmtPrice={fmtPrice}
 fmtPayment={fmtPayment}
 setReceiptSale={setReceiptSale}
 />
 );
 case "Series":
 return (
 <SeriesTab
 notify={notify}
 can={can}
 allSeries={allSeries}
 loadAllSeries={loadAllSeries}
 allEmployees={allEmployees}
 />
 );
 case "Diarios":
 return (
 <DiariosTab
 notify={notify}
 can={can}
 journals={journals}
 loadJournals={loadJournals}
 currencies={currencies}
 activeMethods={activeMethods}
 activeBanks={activeBanks}
 methodByCode={methodByCode}
 />
 );
 case "Bancos":
 return (
 <BancosTab
 notify={notify}
 can={can}
 banks={banks}
 loadBanks={loadBanks}
 />
 );
 case "Tipos de pago":
 return (
 <MetodosTab
 notify={notify}
 can={can}
 paymentMethods={paymentMethods}
 loadPaymentMethods={loadPaymentMethods}
 />
 );
 default:
 return null;
 }
 };

 return (
 <div className="h-full flex flex-col ">

 {/* ── Header ─────────────────────────── */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
 <div>
 <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">MÓDULO FINANCIERO</div>
 <h1 className="text-sm font-black uppercase tracking-tight">Contabilidad</h1>
 </div>
 </div>

 {/* ── Nav agrupada ───────────────────── */}
 <div ref={navRef} className="shrink-0 flex items-stretch gap-0 px-4 border-b border-border/20 dark:border-white/5">
   {NAV_GROUPS.map(group => {
     const isActive = group.items ? group.items.includes(subPage) : subPage === group.label;
     const isOpen   = openGroup === group.label;

     if (!group.items) {
       return (
         <button
           key={group.label}
           onClick={() => { setSubPage(group.label); setOpenGroup(null); }}
           className={`px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 whitespace-nowrap transition-all ${
             isActive ? "border-brand-500 text-brand-500" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
           }`}
         >
           {group.label}
         </button>
       );
     }

     return (
       <div key={group.label} className="relative">
         <button
           onClick={() => setOpenGroup(isOpen ? null : group.label)}
           className={`flex items-center gap-1 px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 whitespace-nowrap transition-all ${
             isActive ? "border-brand-500 text-brand-500" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
           }`}
         >
           {group.label}
           <svg className={`w-3 h-3 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
           </svg>
         </button>
         {isOpen && (
           <div className="absolute top-full left-0 mt-1 bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-xl shadow-lg shadow-black/10 z-50 py-1 min-w-[170px]">
             {group.items.map(item => (
               <button
                 key={item}
                 onClick={() => { setSubPage(item); setOpenGroup(null); }}
                 className={`w-full text-left px-4 py-2 text-[11px] font-bold transition-colors rounded-lg ${
                   subPage === item
                     ? "text-brand-500 bg-brand-500/5"
                     : "text-content dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/5"
                 }`}
               >
                 {item}
               </button>
             ))}
           </div>
         )}
       </div>
     );
   })}
 </div>

 {/* ── Contenido del sub-módulo ─────────────────── */}
 <div className="flex-1 min-h-0 overflow-hidden bg-surface-2 dark:bg-[#0f1117]">
 {renderContent()}
 </div>

 <ReceiptModal open={!!receiptSale} onClose={() => setReceiptSale(null)} sale={receiptSale} />
 </div>
 );
}
