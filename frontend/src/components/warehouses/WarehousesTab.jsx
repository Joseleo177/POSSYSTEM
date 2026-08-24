import { useState, useEffect } from "react";
import { useWarehouses } from "../../hooks/useWarehouses";
import { useWarehouseOps } from "../../hooks/useWarehouseOps";
import { useTransfers } from "../../hooks/useTransfers";
import { useApp } from "../../context/AppContext";
import Page from "../ui/Page";
import { Button } from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";

import WarehousesHeader from "./WarehousesHeader";
import WarehouseGrid from "./WarehouseGrid";
import StockView from "./StockView";
import TransfersView from "./TransfersView";
import WarehouseModal from "./WarehouseModal";
import AddStockModal from "./AddStockModal";
import TransferModal from "./TransferModal";
import TransferReceiveModal from "./TransferReceiveModal";
import TransferDetailModal from "./TransferDetailModal";
import AssignEmployeesModal from "./AssignEmployeesModal";
import EditStockModal from "./EditStockModal";
import AdjustmentsView from "./AdjustmentsView";

export default function WarehousesTab({ notify, currentEmployee }) {
    const [subTab, setSubTab] = useState("almacenes");
    const [warehouseModal, setWarehouseModal] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [openSession, setOpenSession] = useState(null);     // sesión activa en AdjustmentsView
    const [pendingNav, setPendingNav] = useState(null);       // navegación pendiente mientras hay sesión abierta

    // Intercepta cambios de sub-tab: si hay sesión abierta con movimientos, pide confirmación
    const requestSubTab = (newTab) => {
        if (subTab === "ajustes" && openSession && (openSession.line_count > 0 || (openSession.lines?.length > 0))) {
            setPendingNav(newTab);
        } else {
            setSubTab(newTab);
        }
    };

    // Crear, editar, borrar almacenes y asignar usuarios es exclusivo del admin; el backend
    // lo rechaza igual, esto solo evita mostrar botones que van a fallar.
    const isAdmin = !!currentEmployee?.permissions?.all;

    const {
        warehouses, allWarehouses, load: loadWarehouses,
        form, setForm, editId, loading,
        save: saveWarehouseAction,
        remove: deleteWarehouseAction,
        startEdit: startEditHook, cancelEdit: cancelEditHook,
        employees, assignModal, setAssignModal, assignSelected,
        openAssign, toggleAssign, saveAssign,
    } = useWarehouses(notify);

    const { can, companyInfo, printerWidth } = useApp();

    // Despachar y recibir son permisos distintos a propósito: el control cruzado se pierde
    // si la misma persona hace las dos puntas.
    const canReceive = can("inventory.receive");
    const canDispatch = can("inventory.transfer");

    const {
        transfers, summary: transferSummary, loading: loadingTransfers,
        load: loadTransfers,
        search: transferSearch, setSearch: setTransferSearch,
        filters: transferFilters, setFilter: setTransferFilter,
        clearFilters: clearTransferFilters, activeFilterCount: transferFilterCount,
        detail: transferDetail, setDetail: setTransferDetail,
        receiving: transferReceiving, setReceiving: setTransferReceiving,
        doReceive, doResolve, doCancel, saving: savingTransfer,
    } = useTransfers(notify);

    const {
        loadStock, loadingStock,
        stockSearch, setStockSearch, filteredStock,
        stockCategory, setStockCategory,
        stockPage, totalStockItems, stockLimit,
        editStockModal, setEditStockModal, editStockValue, setEditStockValue, handleEditStock, submitEditStock,
        deleteStockModal, setDeleteStockModal, handleDeleteStock, confirmDeleteStock,
        addStockModal, setAddStockModal, openAddStock,
        addStockForm, setAddStockForm,
        addStockProduct, selectAddStockProduct, clearAddStockProduct, doAddStock, savingStock,
        transferProductSearch, setTransferProductSearch,
        transferProductResults, setTransferProductResults,
        transferProductSelected, setTransferProductSelected,
        transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer,
        transferProductTotal, loadingTransferProducts, loadingMoreTransferProducts, loadMoreTransferProducts,
    } = useWarehouseOps(notify, selectedWarehouse, loadWarehouses, loadTransfers);

    useEffect(() => {
        if (subTab === "transferencias") loadTransfers();
    }, [subTab, loadTransfers]);

    useEffect(() => {
        if (subTab === "stock" && selectedWarehouse) loadStock(selectedWarehouse.id);
    }, [subTab, selectedWarehouse, loadStock]);

    // ── Wrappers ──────────────────────────────────────────────
    const openNewWarehouse = () => { cancelEditHook(); setWarehouseModal(true); };
    const startEdit = (w) => { startEditHook(w); setWarehouseModal(true); };
    const cancelEdit = () => { cancelEditHook(); setWarehouseModal(false); };
    const saveWarehouse = async () => { await saveWarehouseAction(); setWarehouseModal(false); };

    // ── Acciones dinámicas por sub-tab ────────────────────────
    const pageActions = subTab === "almacenes" ? (
        isAdmin ? (
            <Button onClick={openNewWarehouse} className="h-8 px-2.5 sm:px-3 text-[10px]">
                + <span className="hidden sm:inline">Nuevo Almacén</span><span className="sm:hidden">Nuevo</span>
            </Button>
        ) : null
    ) : subTab === "stock" && selectedWarehouse ? (
        <Button
            onClick={openAddStock}
            className="h-8 px-2.5 sm:px-3 text-[10px] bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
        >
            + <span className="hidden sm:inline">Registrar Stock</span><span className="sm:hidden">Stock</span>
        </Button>
    ) : subTab === "transferencias" ? (
        canDispatch ? (
            <Button onClick={() => setTransferModal(true)} className="h-8 px-2.5 sm:px-3 text-[10px]">
                + <span className="hidden sm:inline">Despachar Transferencia</span><span className="sm:hidden">Despachar</span>
            </Button>
        ) : null
    ) : null;

    // ── Título dinámico ───────────────────────────────────────
    const pageTitle = subTab === "transferencias"
        ? "Transferencias"
        : subTab === "ajustes"
        ? `Movimiento Manual · ${selectedWarehouse?.name || ""}`
        : subTab === "stock"
        ? `Stock · ${selectedWarehouse?.name || ""}`
        : "Almacenes / Sucursales";

    return (
        <Page
            module="MÓDULO DE INVENTARIO"
            title={pageTitle}
            actions={pageActions}
            subheader={<WarehousesHeader subTab={subTab} setSubTab={requestSubTab} />}
        >
            {subTab === "almacenes" && (
                <WarehouseGrid
                    warehouses={warehouses}
                    isAdmin={isAdmin}
                    openAssign={openAssign}
                    startEdit={startEdit}
                    setDeleteConfirm={setDeleteConfirm}
                    setSelectedWarehouse={setSelectedWarehouse}
                    setSubTab={requestSubTab}
                />
            )}

            {subTab === "stock" && (
                <StockView
                    selectedWarehouse={selectedWarehouse}
                    stockSearch={stockSearch}
                    setStockSearch={setStockSearch}
                    loadingStock={loadingStock}
                    filteredStock={filteredStock}
                    handleEditStock={handleEditStock}
                    handleDeleteStock={handleDeleteStock}
                    openAddStock={openAddStock}
                    loadStock={loadStock}
                    page={stockPage}
                    totalItems={totalStockItems}
                    limit={stockLimit}
                    stockCategory={stockCategory}
                    setStockCategory={setStockCategory}
                />
            )}

            {subTab === "transferencias" && (
                <TransfersView
                    transfers={transfers}
                    summary={transferSummary}
                    loading={loadingTransfers}
                    search={transferSearch}
                    setSearch={setTransferSearch}
                    filters={transferFilters}
                    setFilter={setTransferFilter}
                    clearFilters={clearTransferFilters}
                    activeFilterCount={transferFilterCount}
                    warehouses={warehouses}
                    onOpenDetail={setTransferDetail}
                    onOpenReceive={setTransferReceiving}
                    canReceive={canReceive}
                    currentEmployeeId={currentEmployee?.id}
                    isAdmin={isAdmin}
                />
            )}

            {subTab === "ajustes" && (
                <AdjustmentsView
                    selectedWarehouse={selectedWarehouse}
                    notify={notify}
                    onChangeWarehouse={() => { setSelectedWarehouse(null); requestSubTab("almacenes"); }}
                    onSessionChange={setOpenSession}
                />
            )}

            {/* ── Modales ── */}
            <WarehouseModal
                open={warehouseModal}
                onClose={cancelEdit}
                form={form}
                setForm={setForm}
                editId={editId}
                loading={loading}
                onSave={saveWarehouse}
                parentOptions={warehouses.filter(w => w.sells !== false && w.active)}
            />

            <AddStockModal
                open={addStockModal}
                onClose={() => setAddStockModal(false)}
                selectedWarehouse={selectedWarehouse}
                addStockProduct={addStockProduct}
                clearAddStockProduct={clearAddStockProduct}
                selectAddStockProduct={selectAddStockProduct}
                addStockForm={addStockForm}
                setAddStockForm={setAddStockForm}
                doAddStock={doAddStock}
                savingStock={savingStock}
            />

            <TransferModal
                open={transferModal}
                onClose={() => setTransferModal(false)}
                warehouses={warehouses}
                destWarehouses={allWarehouses}
                transferProductSearch={transferProductSearch}
                setTransferProductSearch={setTransferProductSearch}
                transferProductResults={transferProductResults}
                setTransferProductResults={setTransferProductResults}
                transferProductSelected={transferProductSelected}
                setTransferProductSelected={setTransferProductSelected}
                transferForm={transferForm}
                setTransferForm={setTransferForm}
                doTransfer={doTransfer}
                loadingTransfer={loadingTransfer}
                transferProductTotal={transferProductTotal}
                loadingTransferProducts={loadingTransferProducts}
                loadingMoreTransferProducts={loadingMoreTransferProducts}
                loadMoreTransferProducts={loadMoreTransferProducts}
            />

            <TransferReceiveModal
                open={!!transferReceiving}
                transfer={transferReceiving}
                onClose={() => setTransferReceiving(null)}
                onConfirm={doReceive}
                saving={savingTransfer}
            />

            <TransferDetailModal
                open={!!transferDetail}
                transfer={transferDetail}
                onClose={() => setTransferDetail(null)}
                onResolve={doResolve}
                onCancel={doCancel}
                saving={savingTransfer}
                canManage={canDispatch}
                companyInfo={companyInfo}
                printerWidth={printerWidth}
            />

            <AssignEmployeesModal
                assignModal={assignModal}
                onClose={() => setAssignModal(null)}
                employees={employees}
                assignSelected={assignSelected}
                toggleAssign={toggleAssign}
                saveAssign={saveAssign}
            />

            <EditStockModal
                editStockModal={editStockModal}
                onClose={() => setEditStockModal(null)}
                editStockValue={editStockValue}
                setEditStockValue={setEditStockValue}
                submitEditStock={submitEditStock}
            />

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar almacén?"
                message={`Estás a punto de eliminar "${deleteConfirm?.name}". Esta acción no se puede deshacer y solo es posible si el almacén no tiene stock registrado.`}
                onConfirm={async () => { await deleteWarehouseAction(deleteConfirm.id); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
                confirmText="Sí, eliminar almacén"
            />

            <ConfirmModal
                isOpen={!!deleteStockModal}
                title="¿Retirar producto?"
                message={`Estás a punto de retirar "${deleteStockModal?.product_name}" de este almacén de forma permanente.`}
                onConfirm={confirmDeleteStock}
                onCancel={() => setDeleteStockModal(null)}
                type="danger"
                confirmText="Sí, retirar producto"
            />

            <ConfirmModal
                isOpen={!!pendingNav}
                title="Sesión de ajustes abierta"
                message={`Tienes una sesión con ${openSession?.line_count || openSession?.lines?.length || 0} movimiento(s) registrado(s). Debes cerrarla antes de salir o continuarás perdiéndola al recargar.`}
                onConfirm={() => { setSubTab(pendingNav); setPendingNav(null); }}
                onCancel={() => setPendingNav(null)}
                type="warning"
                confirmText="Salir de todas formas"
                cancelText="Seguir ajustando"
            />
        </Page>
    );
}
