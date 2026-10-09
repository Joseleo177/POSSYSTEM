import NavDropdownMenu from "../components/ui/NavDropdownMenu";
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
import CuentasPorPagarTab from "../components/Contabilidad/CuentasPorPagarTab";
import CuentasPorCobrarTab from "../components/Contabilidad/CuentasPorCobrarTab";
import ConciliacionTab from "../components/Contabilidad/conciliacion/ConciliacionTab";

const SUB_PAGES = ["Estado de Cuenta", "Ingresos", "Egresos", "Facturas", "Notas de Crédito", "Cotizaciones", "Por Cobrar", "Por Pagar", "Pagos", "Conciliación", "Series", "Diarios", "Tipos de pago", "Bancos"];

export default function ContabilidadPage() {
 const {
 notify, can,
 journals, outflowJournals, loadJournals,
 currencies, baseCurrency,
 banks, loadBanks,
 paymentMethods, loadPaymentMethods,
 pendingAction, setPendingAction,
 } = useApp();

 const [allSeries, setAllSeries] = useState([]);
 const [allEmployees, setAllEmployees] = useState([]);
 // Las del propio usuario: un admin las tiene todas, un empleado solo las que tiene
 // asignadas. También es de dónde sale la sucursal al dar de alta una serie — ofrecer una
 // ajena sería mostrar una opción que el backend va a rechazar (y antes de este fix, algo
 // que hasta guardaba: el alta usaba la lista sin recortar de toda la empresa).
 const [myWarehouses, setMyWarehouses] = useState([]);

 const loadAllSeries = useCallback(async () => {
 try {
 const r = await api.series.getAll();
 setAllSeries(r.data);
 } catch (e) { notify(e.message, "err"); }
 }, [notify]);

 const loadAllWarehouses = useCallback(async () => {
 try {
 const r = await api.warehouses.getAll();
 // Ni una serie ni un diario de caja pueden ser de un depósito: no factura, no cobra.
 setMyWarehouses((r.data || []).filter(w => w.sells !== false));
 } catch (e) {}
 }, []);

 // La lista de empleados es un dato auxiliar: solo la usa Series para asignar quién factura
 // con cada una. Si el usuario no gestiona personal, ni se pide —antes se pedía igual y la
 // pantalla recibía al entrar un "Sin permiso para esta acción" que no correspondía a nada
 // que el gerente hubiera hecho. Y si aun así fallara, se calla: no es el objeto de esta
 // pantalla y no hay nada que el usuario pueda hacer al respecto.
 const loadAllEmployees = useCallback(async () => {
 try {
 const r = await api.employees.getAll();
 setAllEmployees(r.data);
 } catch (e) { /* sin permiso o sin red: Series simplemente no ofrece la asignación */ }
 }, []);

 // Cada pantalla de configuración responde a su propio permiso: la numeración fiscal a
 // `series`, y los bancos, diarios y métodos de pago a `journals`. Antes las cuatro se
 // ofrecían con el viejo `config`, que como permiso suelto lo cumple casi cualquiera.
 const canSeries   = can("series.view");
 const canJournals = can("journals.view");
 const canConfig   = canSeries || canJournals;
 // Solo para ofrecer la asignación de series a usuarios; no habilita nada más.
 const canManageUsers = can("employees.view");
 const canPayables    = can("purchases.view");
 const canReceivables = can("sales.view") || can("accounting.view");
 const canReconcile   = can("accounting.reconcile");

 useEffect(() => {
 if (!canConfig) return;
 loadAllSeries();
 loadAllWarehouses();
 if (canManageUsers) loadAllEmployees();
 }, [canConfig, canManageUsers, loadAllSeries, loadAllEmployees, loadAllWarehouses]);

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
   // Lo que nos deben y lo que se debe. Cada una responde al permiso de lo que lee: Por
   // Cobrar a ver ventas (o contabilidad), Por Pagar a ver compras.
   ...((canReceivables || canPayables) ? [{ label: "Cuentas", items: [
     ...(canReceivables ? ["Por Cobrar"] : []),
     ...(canPayables    ? ["Por Pagar"]  : []),
   ] }] : []),
   { label: "Pagos",       items: null },
   // Casar el extracto del banco con los cobros: lo que verifica que el dinero llegó.
   ...(canReconcile ? [{ label: "Conciliación", items: null }] : []),
   // Solo se listan las pantallas que el rol puede abrir de verdad: ofrecer "Series" a quien
   // no tiene el permiso lo llevaba a una pantalla que el servidor le niega.
   ...(canConfig ? [{ label: "Configuración", items: [
     ...(canSeries   ? ["Series"] : []),
     ...(canJournals ? ["Tipos de pago", "Bancos", "Diarios"] : []),
   ] }] : []),
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
 journals={outflowJournals}
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
 case "Por Cobrar":
 return <CuentasPorCobrarTab notify={notify} fmtPrice={fmtPrice} />;
 case "Por Pagar":
 return <CuentasPorPagarTab notify={notify} fmtPrice={fmtPrice} />;
 case "Pagos":
 return (
 <PagosTab
 notify={notify}
 can={can}
 baseCurrency={baseCurrency}
 fmtPrice={fmtPrice}
 fmtPayment={fmtPayment}
 setReceiptSale={setReceiptSale}
 journals={journals}
 />
 );
 case "Conciliación":
 return <ConciliacionTab notify={notify} />;
 case "Series":
 return (
 <SeriesTab
 notify={notify}
 can={can}
 allSeries={allSeries}
 loadAllSeries={loadAllSeries}
 allEmployees={allEmployees}
 allWarehouses={myWarehouses}
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
 warehouses={myWarehouses}
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
 <div className="text-[11px] sm:text-[12px] font-semibold text-brand-600 dark:text-brand-400 leading-none mb-1">Finanzas</div>
 <h1 className="text-[15px] sm:text-[17px] font-bold tracking-[-0.015em] leading-tight text-content dark:text-white">Contabilidad</h1>
 </div>
 </div>

 {/* ── Nav agrupada ───────────────────── */}
 {/* flex-wrap y no overflow-x-auto: los cuatro grupos no caben en el ancho de un
     teléfono y quedaban cortados sin forma de alcanzarlos. Con scroll horizontal se
     resolvería el acceso, pero el overflow recortaría los desplegables de Movimientos
     y Ventas, que son hijos absolute de esta misma barra. */}
 <div ref={navRef} className="shrink-0 flex flex-wrap items-stretch gap-0 px-4 border-b border-border/20 dark:border-white/5">
   {NAV_GROUPS.map(group => {
     const isActive = group.items ? group.items.includes(subPage) : subPage === group.label;
     const isOpen   = openGroup === group.label;

     if (!group.items) {
       return (
         <button
           key={group.label}
           onClick={() => { setSubPage(group.label); setOpenGroup(null); }}
           className={`px-2.5 sm:px-4 py-2 text-[12px] sm:text-[13px] font-semibold border-b-2 whitespace-nowrap transition-all ${
             isActive ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
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
           className={`flex items-center gap-1 px-2.5 sm:px-4 py-2 text-[12px] sm:text-[13px] font-semibold border-b-2 whitespace-nowrap transition-all ${
             isActive ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
           }`}
         >
           {group.label}
           <svg className={`w-3 h-3 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
           </svg>
         </button>
         {isOpen && (
           <NavDropdownMenu
             items={group.items}
             active={subPage}
             onSelect={item => { setSubPage(item); setOpenGroup(null); }}
           />
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
