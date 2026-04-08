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
    <div className="p-4 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="w-10 h-10 rounded-2xl bg-brand-500/10 flex items-center justify-center text-2xl lg:text-3xl shadow-inner border border-brand-500/20 shrink-0">

          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-content dark:text-content-dark tracking-tighter uppercase mb-0.5 lg:mb-1">
              Contabilidad <span className="text-brand-500">.</span>
            </h1>
            <p className="text-[9px] lg:text-[10px] font-bold text-content-subtle uppercase tracking-[2px] lg:tracking-[3px] opacity-70">
              Gestión de Finanzas, Libros y Correlativos
            </p>
          </div>
        </div>

        {/* NAVEGACIÓN PREMIUM */}
        <div className="relative group w-full md:w-72">
          <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-2 ml-1 opacity-50">Seleccionar Módulo</div>
          <button
            onClick={() => setDropOpen(!dropOpen)}
            className="flex items-center justify-between w-full px-4 py-2.5 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-sm hover:shadow-md transition-all group"
          >
            <span className="text-xs font-black uppercase tracking-widest text-brand-500">{subPage}</span>
            <span className={`text-xs transition-transform duration-300 ${dropOpen ? "rotate-180" : ""}`}>▼</span>
          </button>

          {dropOpen && (
            <>
              <div className="fixed inset-0 z-[40]" onClick={() => setDropOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-2xl shadow-2xl z-[50] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {visibleSubPages.map(p => (
                  <button
                    key={p}
                    onClick={() => { setSubPage(p); setDropOpen(false); }}
                    className={[
                      "w-full px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest transition-colors border-none cursor-pointer",
                      subPage === p
                        ? "bg-brand-500 text-black"
                        : "text-content-subtle hover:bg-surface-2 dark:hover:bg-surface-dark-3 hover:text-content"
                    ].join(" ")}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {renderContent()}

      <ReceiptModal
        open={!!receiptSale}
        onClose={() => setReceiptSale(null)}
        sale={receiptSale}
      />
    </div>
  );
}
