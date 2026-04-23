import { useState } from "react";
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

export default function ReportesPage() {
  const [tab, setTab] = useState("ventas");

  const subheader = (
    <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto">
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`text-[11px] font-black uppercase tracking-wide border-b-2 px-3 py-2.5 whitespace-nowrap transition-all ${
            tab === t.key
              ? "border-brand-500 text-brand-500"
              : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
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
