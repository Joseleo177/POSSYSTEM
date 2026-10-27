import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import OrdersView from "../components/fabrica/OrdersView";
import PiecesView from "../components/fabrica/PiecesView";
import MaterialsView from "../components/fabrica/MaterialsView";
import OrderFormModal from "../components/fabrica/OrderFormModal";
import OrderDetailModal from "../components/fabrica/OrderDetailModal";
import RegisterPiecesModal from "../components/fabrica/RegisterPiecesModal";
import MaterialModal from "../components/fabrica/MaterialModal";
import PieceHistoryModal from "../components/fabrica/PieceHistoryModal";
import RecipesView from "../components/fabrica/RecipesView";
import RecipeModal from "../components/fabrica/RecipeModal";
import StagesView from "../components/fabrica/StagesView";

// Módulo Fábrica: el seguimiento de cada pieza de material desde que llega hasta que no queda nada.
//   Órdenes     lo que se fabrica: qué piezas se entregaron, qué volvió y cuánto costó
//   Piezas      cada pieza numerada y sus retazos, con el buscador por medida
//   Recetas     qué lleva cada producto estándar: cortes, accesorios e instrucciones
//   Materiales  los productos con control por piezas (por área o por longitud)
//   Etapas      las columnas del tablero del taller y su costo por hora (mano de obra)
const TABS = [
    { id: "ordenes",    label: "Órdenes" },
    { id: "laminas",    label: "Piezas" },
    { id: "recetas",    label: "Recetas" },
    { id: "materiales", label: "Materiales" },
    { id: "etapas",     label: "Etapas" },
];
const TAB_KEY = "fabrica_pestana";

export default function FabricaPage() {
    const { can } = useApp();
    const canManage = can("factory.manage");

    const [tab, setTabState] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "ordenes"; } catch { return "ordenes"; }
    });
    const setTab = (t) => {
        setTabState(t);
        try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado */ }
    };

    const [warehouses, setWarehouses] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [stages, setStages] = useState([]);
    // Cualquier cambio (orden, devolución, alta de piezas) refresca las tres vistas.
    const [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);

    const [newOrder, setNewOrder] = useState(false);
    const [openOrderId, setOpenOrderId] = useState(null);
    const [registering, setRegistering] = useState(false);
    const [material, setMaterial] = useState(null);       // null cerrado · {} nuevo · fila a editar
    const [openPieceId, setOpenPieceId] = useState(null);
    const [recipeId, setRecipeId] = useState(null);       // null cerrado · "new" · id del producto

    useEffect(() => {
        api.warehouses.getAll()
            .then(r => setWarehouses((r.data || []).filter(w => w.active !== false)))
            .catch(() => {});
    }, []);

    useEffect(() => {
        api.factory.materials().then(r => setMaterials(r.data || [])).catch(() => {});
        api.factory.stages().then(r => setStages(r.data || [])).catch(() => {});
    }, [version]);

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

    const actions = canManage && (
        tab === "ordenes"    ? <Button onClick={() => setNewOrder(true)}>+ Nueva orden</Button>
      : tab === "laminas"    ? <Button onClick={() => setRegistering(true)}>+ Registrar piezas</Button>
      : tab === "recetas"    ? <Button onClick={() => setRecipeId("new")}>+ Nueva receta</Button>
      : tab === "materiales" ? <Button onClick={() => setMaterial({})}>+ Nuevo material</Button>
      :                        null
    );

    const titles = { ordenes: "Órdenes de fabricación", laminas: "Piezas y retazos", recetas: "Recetas", materiales: "Materiales", etapas: "Etapas del taller" };

    return (
        <Page module="Fábrica" title={titles[tab]} subheader={subheader} actions={actions}>
            {tab === "ordenes" && (
                <OrdersView warehouses={warehouses} stages={stages} canManage={canManage} version={version}
                    onOpen={o => setOpenOrderId(o.id)} onChanged={refresh} />
            )}
            {tab === "laminas" && (
                <PiecesView warehouses={warehouses} materials={materials} version={version}
                    onOpen={p => setOpenPieceId(p.id)} onRegister={canManage ? () => setRegistering(true) : null} />
            )}
            {tab === "recetas" && (
                <RecipesView version={version}
                    onOpen={canManage ? r => setRecipeId(r.product_id) : null} onNew={canManage ? () => setRecipeId("new") : null} />
            )}
            {tab === "etapas" && <StagesView version={version} canManage={canManage} onChanged={refresh} />}
            {tab === "materiales" && (
                <MaterialsView warehouses={warehouses} version={version}
                    onEdit={canManage ? m => setMaterial(m) : null} onNew={canManage ? () => setMaterial({}) : null} />
            )}

            <OrderFormModal open={newOrder} warehouses={warehouses}
                onClose={() => setNewOrder(false)}
                onSaved={o => { setNewOrder(false); refresh(); setOpenOrderId(o.id); }} />

            <OrderDetailModal orderId={openOrderId} materials={materials} warehouses={warehouses} stages={stages}
                onClose={() => setOpenOrderId(null)} onChanged={refresh}
                onOpenPiece={id => setOpenPieceId(id)} />

            <RegisterPiecesModal open={registering} warehouses={warehouses} materials={materials}
                onClose={() => setRegistering(false)}
                onSaved={() => { setRegistering(false); refresh(); }}
                onNewMaterial={() => { setRegistering(false); setMaterial({}); }} />

            <MaterialModal material={material} warehouses={warehouses}
                onClose={() => setMaterial(null)}
                onSaved={() => { setMaterial(null); refresh(); }} />

            <RecipeModal productId={recipeId} materials={materials} stages={stages}
                onClose={() => setRecipeId(null)}
                onSaved={() => { setRecipeId(null); refresh(); }} />

            <PieceHistoryModal pieceId={openPieceId}
                onClose={() => setOpenPieceId(null)} onChanged={refresh}
                onOpenOrder={id => { setOpenPieceId(null); setOpenOrderId(id); }} />
        </Page>
    );
}
