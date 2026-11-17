import { useCallback, useState } from "react";
import { useApp } from "../context/AppContext";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import TipsView from "../components/propinas/TipsView";
import TipSalesView from "../components/propinas/TipSalesView";
import TipStatementModal from "../components/propinas/TipStatementModal";
import PoolSplitModal from "../components/propinas/PoolSplitModal";
import SellersView from "../components/comisiones/SellersView";
import SellerModal from "../components/comisiones/SellerModal";
import PayoutModal from "../components/comisiones/PayoutModal";

// Propinas (extra por empresa, ver services/tips en el backend).
//   Propinas  lo que le tocó a cada persona en el período, lo que se le debe, el pozo y los pagos
//   Facturas  cada factura con propina y a quién le tocó; corregirla pide su propio permiso
//   Personal  quiénes son (la misma lista de Comisiones) y su usuario de la tablet
const TABS = [
    { id: "propinas", label: "Propinas" },
    { id: "facturas", label: "Facturas" },
    { id: "personal", label: "Personal" },
];
const TAB_KEY = "propinas_pestana";

export default function PropinasPage() {
    const { can } = useApp();
    const canManage = can("tips.manage");

    const [tab, setTabState] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "propinas"; } catch { return "propinas"; }
    });
    const setTab = (t) => {
        setTabState(t);
        try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado */ }
    };

    const [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    const [editing, setEditing] = useState(null);      // null cerrado · {} nueva · fila
    const [statement, setStatement] = useState(null);  // { seller, range }
    const [paying, setPaying] = useState(null);        // fila del reporte
    const [pool, setPool] = useState(null);            // { saldo, from, to, personas } — paso 1 del reparto
    const [reparto, setReparto] = useState(null);      // { shares, total, ... } — paso 2: el pago

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto scrollbar-hide">
            {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                    className={["px-4 py-2 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0",
                        tab === t.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    ].join(" ")}>
                    {t.label}
                </button>
            ))}
        </div>
    );

    const actions = canManage && tab === "personal" && <Button onClick={() => setEditing({})}>+ Nueva persona</Button>;
    const titulo = tab === "propinas" ? "Propinas del personal" : tab === "facturas" ? "Facturas con propina" : "Personal";

    return (
        <Page module="Propinas" title={titulo} subheader={subheader} actions={actions}>
            {tab === "propinas" && (
                <TipsView version={version}
                    onOpen={(seller, range) => setStatement({ seller, range })}
                    onPay={setPaying}
                    onPool={setPool}
                    onGoSales={() => setTab("facturas")} />
            )}
            {tab === "facturas" && <TipSalesView version={version} onChanged={refresh} />}
            {tab === "personal" && (
                <SellersView fuente="tips" version={version}
                    onEdit={canManage ? setEditing : null}
                    onNew={canManage ? () => setEditing({}) : null} />
            )}

            <SellerModal fuente="tips" seller={editing} onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); refresh(); }} />

            <TipStatementModal seller={statement?.seller || null} range={statement?.range || {}}
                onClose={() => setStatement(null)}
                onPay={(s) => setPaying(s)}
                onChanged={refresh} />

            <PayoutModal fuente="tips" seller={paying} onClose={() => setPaying(null)}
                onPaid={() => { setPaying(null); setStatement(null); refresh(); }} />

            <PoolSplitModal pool={pool} onClose={() => setPool(null)}
                onContinue={(r) => { setPool(null); setReparto(r); }} />

            <PayoutModal fuente="tips" reparto={reparto}
                seller={reparto ? { id: "pozo", name: "Pozo de propinas", code: `${reparto.shares.length} ${reparto.shares.length === 1 ? "persona" : "personas"}`, saldo: reparto.total } : null}
                onClose={() => setReparto(null)}
                onPaid={() => { setReparto(null); refresh(); }} />
        </Page>
    );
}
