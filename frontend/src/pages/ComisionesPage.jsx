import { useCallback, useState } from "react";
import { useApp } from "../context/AppContext";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import CommissionsView from "../components/comisiones/CommissionsView";
import SellersView from "../components/comisiones/SellersView";
import SellerModal from "../components/comisiones/SellerModal";
import StatementModal from "../components/comisiones/StatementModal";
import PayoutModal from "../components/comisiones/PayoutModal";

// Comisiones por vendedor (extra por empresa, ver services/commissions en el backend).
//   Comisiones  lo que ganó cada uno en el período, lo que se le debe y su estado de cuenta
//   Vendedores  quiénes son, su código para la caja y su %
const TABS = [
    { id: "comisiones", label: "Comisiones" },
    { id: "vendedores", label: "Vendedores" },
];
const TAB_KEY = "comisiones_pestana";

export default function ComisionesPage() {
    const { can } = useApp();
    const canManage = can("commissions.manage");

    const [tab, setTabState] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "comisiones"; } catch { return "comisiones"; }
    });
    const setTab = (t) => {
        setTabState(t);
        try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado */ }
    };

    const [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    const [editing, setEditing] = useState(null);     // null cerrado · {} nuevo · fila
    const [statement, setStatement] = useState(null); // { seller, range }
    const [paying, setPaying] = useState(null);       // fila del reporte

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

    const actions = canManage && <Button onClick={() => setEditing({})}>+ Nuevo vendedor</Button>;

    return (
        <Page module="Comisiones" title={tab === "comisiones" ? "Comisiones por vendedor" : "Vendedores"} subheader={subheader} actions={actions}>
            {tab === "comisiones" && (
                <CommissionsView version={version}
                    onOpen={(seller, range) => setStatement({ seller, range })}
                    onPay={setPaying}
                    onNewSeller={canManage ? () => setEditing({}) : null} />
            )}
            {tab === "vendedores" && (
                <SellersView version={version}
                    onEdit={canManage ? setEditing : null}
                    onNew={canManage ? () => setEditing({}) : null} />
            )}

            <SellerModal seller={editing} onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); refresh(); }} />

            <StatementModal seller={statement?.seller || null} range={statement?.range || {}}
                onClose={() => setStatement(null)}
                onPay={(s) => setPaying(s)}
                onChanged={refresh} />

            <PayoutModal seller={paying} onClose={() => setPaying(null)}
                onPaid={() => { setPaying(null); setStatement(null); refresh(); }} />
        </Page>
    );
}
