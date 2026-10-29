import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import CustomSelect from "../components/ui/CustomSelect";
import { Button } from "../components/ui/Button";
import PlatosView from "../components/recetas/PlatosView";
import PreparacionesView from "../components/recetas/PreparacionesView";
import ProduccionView from "../components/recetas/ProduccionView";
import PreparationModal from "../components/recetas/PreparationModal";
import BatchFormModal from "../components/recetas/BatchFormModal";
import BatchDetailModal from "../components/recetas/BatchDetailModal";

// App Recetas (restaurante).
//   Platos         la ficha técnica de cada plato: costo, food cost y lo que descuenta al venderse
//   Preparaciones  lo que la cocina hace por tanda (la olla de sopa, la salsa) y cuánto rinde
//   Producción     cada tanda hecha (OP-0001): lo que se gastó y lo que salió de verdad
// Precio, costo y existencias son los de la sucursal elegida.

const TABS = [
    { id: "platos",        label: "Platos" },
    { id: "preparaciones", label: "Preparaciones" },
    { id: "produccion",    label: "Producción" },
];
const TITULOS = { platos: "Fichas técnicas", preparaciones: "Preparaciones", produccion: "Producción de cocina" };
const TAB_KEY = "recetas_pestana";

// La sucursal elegida se recuerda por empresa: el navegador se comparte entre empresas.
const claveSucursal = (emp) => `recetas_sucursal_${emp?.company_id ?? "0"}`;
const leer = (k, def = "") => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export default function RecetasPage() {
    const { employee, can } = useApp();
    const canEdit = can("products.edit");
    const canProduce = can("production.manage");

    const [tab, setTabState] = useState(() => {
        const t = leer(TAB_KEY, "platos");
        return TABS.some(x => x.id === t) ? t : "platos";
    });
    const setTab = (t) => { setTabState(t); guardar(TAB_KEY, t); };

    const [warehouses, setWarehouses] = useState([]);
    const [whReady, setWhReady] = useState(false);
    const [warehouseId, setWarehouseIdState] = useState(() => leer(claveSucursal(employee)));
    const setWarehouseId = (v) => { setWarehouseIdState(v); guardar(claveSucursal(employee), v); };

    // Cualquier cambio (preparación guardada, tanda registrada o anulada) refresca las vistas.
    const [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);

    const [prepId, setPrepId] = useState(null);       // null cerrado · "new" · id
    const [produce, setProduce] = useState(null);     // null cerrado · { product_id? }
    const [batchId, setBatchId] = useState(null);
    const [picking, setPicking] = useState(false);    // "Nueva ficha": elegir el plato

    useEffect(() => {
        api.warehouses.getAll()
            .then(r => {
                const activos = (r.data || []).filter(w => w.active !== false);
                setWarehouses(activos);
                // Sin sucursal recordada (o ya no visible), la primera.
                setWarehouseIdState(prev => (activos.some(w => String(w.id) === prev) ? prev : String(activos[0]?.id || "")));
            })
            .catch(() => {})
            .finally(() => setWhReady(true));
    }, []);

    const sucursal = warehouses.length > 1 ? (
        <CustomSelect className="w-40 sm:w-48 shrink-0" height="h-9" value={warehouseId} onChange={setWarehouseId}
            options={warehouses.map(w => ({ value: String(w.id), label: w.name }))} />
    ) : null;

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto scrollbar-hide">
            {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                    className={["px-4 py-2 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0",
                        tab === t.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white",
                    ].join(" ")}>
                    {t.label}
                </button>
            ))}
        </div>
    );

    const actions = tab === "platos" && canEdit ? <Button onClick={() => setPicking(true)}>+ Nueva ficha</Button>
        : tab === "preparaciones" && canEdit ? <Button onClick={() => setPrepId("new")}>+ Nueva preparación</Button>
        : tab === "produccion" && canProduce ? <Button onClick={() => setProduce({})}>Registrar producción</Button>
        : null;

    return (
        <Page module="Recetas" title={TITULOS[tab]} subheader={subheader} actions={actions}>
            {whReady && tab === "platos" && (
                <PlatosView warehouseId={warehouseId} sucursal={sucursal}
                    picking={picking} onPickClose={() => setPicking(false)} onNew={canEdit ? () => setPicking(true) : null} />
            )}
            {whReady && tab === "preparaciones" && (
                <PreparacionesView warehouseId={warehouseId} sucursal={sucursal} version={version}
                    onOpen={p => setPrepId(p.product_id)}
                    onProduce={canProduce ? p => setProduce({ product_id: p.product_id }) : null} />
            )}
            {whReady && tab === "produccion" && (
                <ProduccionView warehouseId={warehouseId} sucursal={sucursal} version={version}
                    onOpen={b => setBatchId(b.id)} onNew={canProduce ? () => setProduce({}) : null} />
            )}

            <PreparationModal productId={prepId} warehouseId={warehouseId}
                onClose={() => setPrepId(null)}
                onSaved={() => { setPrepId(null); refresh(); }}
                onProduce={canProduce ? p => { setPrepId(null); setProduce({ product_id: p.product_id }); } : null} />

            <BatchFormModal open={produce != null} initial={produce} warehouseId={warehouseId} warehouses={warehouses}
                onClose={() => setProduce(null)}
                onSaved={b => { setProduce(null); refresh(); setBatchId(b.id); }} />

            <BatchDetailModal batchId={batchId} onClose={() => setBatchId(null)} onChanged={refresh} />
        </Page>
    );
}
