import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import ReceiptModal from "../components/ReceiptModal";
import { fmtBase, fmtSale as fmtSaleHelper, fmtPayment as fmtPaymentHelper } from "../helpers";


// Sub-components
import IngresosTab from "../components/Contabilidad/IngresosTab";
import TransaccionesTab from "../components/Contabilidad/TransaccionesTab";
import PagosTab from "../components/Contabilidad/PagosTab";
import SeriesTab from "../components/Contabilidad/SeriesTab";
import DiariosTab from "../components/Contabilidad/DiariosTab";
import BancosTab from "../components/Contabilidad/BancosTab";
import MetodosTab from "../components/Contabilidad/MetodosTab";

const SUB_PAGES = ["Ingresos", "Transacciones", "Pagos", "Series", "Diarios", "Tipos de pago", "Bancos"];

export default function ContabilidadPage() {
 const {
 notify, can,
 journals, loadJournals,
 currencies, baseCurrency,
 banks, loadBanks,
 paymentMethods, loadPaymentMethods,
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

 const [subPage, setSubPage] = useState("Ingresos");
 const [dropOpen, setDropOpen] = useState(false);
 const [receiptSale, setReceiptSale] = useState(null);

 const fmtPrice = (n) => fmtBase(n, baseCurrency);
 const fmtSale = (sale, amt) => fmtSaleHelper(sale, amt, baseCurrency);
 const fmtPayment = (pay) => fmtPaymentHelper(pay, baseCurrency);

 const activeMethods = paymentMethods.filter(m => m.active);
 const activeBanks = banks.filter(b => b.active);
 const methodByCode = Object.fromEntries(paymentMethods.map(m => [m.code, m]));
 const visibleSubPages = canConfig
 ? SUB_PAGES
 : SUB_PAGES.filter((p) => !["Series", "Diarios", "Tipos de pago", "Bancos"].includes(p));

 useEffect(() => {
 if (!visibleSubPages.includes(subPage)) {
 setSubPage(visibleSubPages[0] || "Ingresos");
 }
 }, [subPage, visibleSubPages]);

 const renderContent = () => {
 switch (subPage) {
 case "Ingresos":
 return (
 <IngresosTab
 notify={notify}
 fmtPrice={fmtPrice}
 allSeries={allSeries}
 />
 );
 case "Transacciones":
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

 {/* ── Header compacto ─────────────────────────── */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
 <div>
 <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">MÓDULO FINANCIERO</div>
 <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">Contabilidad</h1>
 </div>
 </div>

 {/* ── Tabs compactos ───────────────────────────── */}
 <div className="shrink-0 px-4 py-1.5 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02]">
 <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
 {visibleSubPages.map(p => (
 <button
 key={p}
 onClick={() => setSubPage(p)}
 className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide whitespace-nowrap transition-all ${
 subPage === p
 ? "bg-brand-500 text-black shadow-[0_0_12px_rgba(20,184,166,0.3)]"
 : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/5"
 }`}
 >
 {p}
 </button>
 ))}
 </div>
 </div>

 {/* ── Contenido del sub-módulo ─────────────────── */}
 <div className="flex-1 min-h-0 overflow-hidden bg-surface-2 dark:bg-[#0f1117]">
 {renderContent()}
 </div>

 <ReceiptModal open={!!receiptSale} onClose={() => setReceiptSale(null)} sale={receiptSale} />
 </div>
 );
}
