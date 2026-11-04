import { useState } from "react";
import { useApp } from "../context/AppContext";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import RutaView from "../components/cobranza/RutaView";
import SectoresView from "../components/cobranza/SectoresView";
import RegalosView from "../components/cobranza/RegalosView";

// Cobranza por sectores (extra por empresa, ver services/cobranza en el backend).
//   Ruta      los clientes de mis sectores: lo que deben, abonar y dejar mercancía
//   Regalos   lo que hay que entregar en la ruta (y lo entregado o anulado)
//   Sectores  pueblos o zonas, su sucursal, sus cobradores y lo que se deja (quien administra)
const TAB_KEY = "cobranza_pestana";

export default function CobranzaPage() {
    const { can } = useApp();
    const canManage = can("cobranza.manage");
    const tabs = [{ id: "ruta", label: "Ruta" }, { id: "regalos", label: "Regalos" }, ...(canManage ? [{ id: "sectores", label: "Sectores" }] : [])];

    const [tab, setTabState] = useState(() => {
        try { const t = localStorage.getItem(TAB_KEY); return t === "regalos" || (t === "sectores" && canManage) ? t : "ruta"; } catch { return "ruta"; }
    });
    const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado */ } };
    const [version, setVersion] = useState(0);
    const [nuevo, setNuevo] = useState(0);

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/60 dark:border-white/[0.06] overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                    className={["px-4 h-11 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0",
                        tab === t.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle hover:text-content dark:hover:text-white"
                    ].join(" ")}>
                    {t.label}
                </button>
            ))}
        </div>
    );

    const actions = tab === "sectores" && canManage && <Button onClick={() => setNuevo(n => n + 1)}>+ Nuevo sector</Button>;

    return (
        <Page module="Cobranza" title={tab === "ruta" ? "Ruta de cobranza" : tab === "regalos" ? "Regalos" : "Sectores"} subheader={subheader} actions={actions}>
            {tab === "ruta" && <RutaView version={version} />}
            {tab === "regalos" && <RegalosView version={version} />}
            {tab === "sectores" && <SectoresView version={version} nuevo={nuevo} onChanged={() => setVersion(v => v + 1)} />}
        </Page>
    );
}
