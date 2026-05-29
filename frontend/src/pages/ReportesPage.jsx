import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import Page from "../components/ui/Page";

import SalesReport from "./reportes/SalesReport";
import InventoryReport from "./reportes/InventoryReport";
import MarginsReport from "./reportes/MarginsReport";
import CustomersReport from "./reportes/CustomersReport";
import AuditReport from "./reportes/AuditReport";
import ReceivablesReport from "./reportes/ReceivablesReport";
import PurchasesReport from "./reportes/PurchasesReport";
import CashSessionsReport from "./reportes/CashSessionsReport";
import ExpiryReport from "./reportes/ExpiryReport";

const TABS = [
  { key: "ventas",       label: "Ventas" },
  { key: "inventario",   label: "Inventario" },
  { key: "margenes",     label: "Márgenes" },
  { key: "clientes",     label: "Clientes" },
  { key: "auditoria",    label: "Auditoría" },
  { key: "cobrar",       label: "Cobrar" },
  { key: "compras",      label: "Compras" },
  { key: "sesiones",     label: "Cajas" },
  { key: "vencimientos", label: "Vencimientos" },
];

const NAV_GROUPS = [
  { label: "Comercial",   items: ["ventas", "margenes", "cobrar", "clientes"] },
  { label: "Inventario",  items: ["inventario", "vencimientos", "compras"] },
  { label: "Operaciones", items: ["sesiones", "auditoria"] },
];

const tabLabel = (key) => TABS.find(t => t.key === key)?.label ?? key;

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");
  const [openGroup, setOpenGroup] = useState(null);
  const navRef = useRef(null);
  const { pendingAction, setPendingAction } = useApp();

  useEffect(() => {
    const handler = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!pendingAction?.startsWith("reportes:")) return;
    const target = pendingAction.slice("reportes:".length);
    if (TABS.some(t => t.key === target)) setTab(target);
    setPendingAction(null);
  }, [pendingAction]);

  const subheader = (
    <div ref={navRef} className="flex items-stretch gap-0 px-4 border-b border-border/20 dark:border-white/5">
      {NAV_GROUPS.map(group => {
        const isActive = group.items.includes(tab);
        const isOpen   = openGroup === group.label;
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-xl shadow-lg shadow-black/10 z-50 py-1 min-w-[150px]">
                {group.items.map(key => (
                  <button
                    key={key}
                    onClick={() => { setTab(key); setOpenGroup(null); }}
                    className={`w-full text-left px-4 py-2 text-[11px] font-bold transition-colors rounded-lg ${
                      tab === key ? "text-brand-500 bg-brand-500/5" : "text-content dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/5"
                    }`}
                  >
                    {tabLabel(key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <Page module="MÓDULO DE ANALÍTICA" title="Reportes Estratégicos" subheader={subheader}>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {tab === "ventas"       && <SalesReport />}
        {tab === "inventario"   && <InventoryReport />}
        {tab === "margenes"     && <MarginsReport />}
        {tab === "clientes"     && <CustomersReport />}
        {tab === "auditoria"    && <AuditReport />}
        {tab === "cobrar"       && <ReceivablesReport />}
        {tab === "compras"      && <PurchasesReport />}
        {tab === "sesiones"     && <CashSessionsReport />}
        {tab === "vencimientos" && <ExpiryReport />}
      </div>
    </Page>
  );
}
