import { useState } from "react";

// ── Módulos de reporte ────────────────────────────────────────
import SalesReport        from "./reportes/SalesReport";
import InventoryReport    from "./reportes/InventoryReport";
import MarginsReport      from "./reportes/MarginsReport";
import CustomersReport    from "./reportes/CustomersReport";
import AuditReport        from "./reportes/AuditReport";
import ReceivablesReport  from "./reportes/ReceivablesReport";
import PurchasesReport    from "./reportes/PurchasesReport";
import CashSessionsReport from "./reportes/CashSessionsReport";

const TABS = [
  { key: "ventas",      label: "Ventas" },
  { key: "inventario",  label: "Inventario" },
  { key: "margenes",    label: "Márgenes" },
  { key: "clientes",    label: "Clientes" },
  { key: "auditoria",   label: "Auditoría" },
  { key: "cobrar",      label: "Cobrar" },
  { key: "compras",     label: "Compras" },
  { key: "sesiones",    label: "Cajas" },
];

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");

  return (
    // h-full: fills the <main> container in App.jsx which is already h-full + overflow-hidden
    <div className="h-full flex flex-col bg-surface-2 dark:bg-surface-dark text-content dark:text-white overflow-hidden">

      {/* ── Header compacto ────────────────────────────── */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/30 dark:border-white/5">
        <div>
          <div className="text-[10px] font-black text-brand-500 uppercase tracking-[3px] leading-none mb-0.5">
            MÓDULO DE ANALÍTICA
          </div>
          <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">
            Reportes Estratégicos
          </h1>
        </div>
        <div className="hidden md:block">
          <span className="text-[8px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
            Inteligencia en tiempo real
          </span>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-1.5 border-b border-border/20 dark:border-white/5 bg-surface-3/30 dark:bg-white/[0.02]">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                tab === t.key
                  ? "bg-brand-500 text-black shadow-[0_0_16px_rgba(20,184,166,0.35)]"
                  : "text-content-muted dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido del reporte activo ─────────────────── */}
      {/* flex-1 + min-h-0 permite que el hijo ocupe el espacio restante sin desbordarse */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden">
        {tab === "ventas"     && <SalesReport />}
        {tab === "inventario" && <InventoryReport />}
        {tab === "margenes"   && <MarginsReport />}
        {tab === "clientes"   && <CustomersReport />}
        {tab === "auditoria"  && <AuditReport />}
        {tab === "cobrar"     && <ReceivablesReport />}
        {tab === "compras"    && <PurchasesReport />}
        {tab === "sesiones"   && <CashSessionsReport />}
      </div>
    </div>
  );
}
