import { useState, useEffect } from "react";
import { useWarehouses } from "../../hooks/useWarehouses";
import { useWarehouseOps } from "../../hooks/useWarehouseOps";
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
import AssignEmployeesModal from "./AssignEmployeesModal";
import EditStockModal from "./EditStockModal";
import AdjustmentsView from "./AdjustmentsView";

export default function WarehousesTab({ notify, currentEmployee }) {
    const [subTab, setSubTab] = useState("almacenes");
    const [warehouseModal, setWarehouseModal] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const {
        warehouses, load: loadWarehouses,
        form, setForm, editId, loading,
        save: saveWarehouseAction,
        remove: deleteWarehouseAction,
        startEdit: startEditHook, cancelEdit: cancelEditHook,
        employees, assignModal, setAssignModal, assignSelected,
        openAssign, toggleAssign, saveAssign,
    } = useWarehouses(notify);

    const {
        loadStock, loadingStock,
        stockSearch, setStockSearch, filteredStock,
        stockPage, totalStockItems, stockLimit,
        editStockModal, setEditStockModal, editStockValue, setEditStockValue, handleEditStock, submitEditStock,
        deleteStockModal, setDeleteStockModal, handleDeleteStock, confirmDeleteStock,
        addStockModal, setAddStockModal, openAddStock,
        addStockForm, setAddStockForm, addStockSearch, setAddStockSearch, addStockResults,
        addStockProduct, selectAddStockProduct, clearAddStockProduct, doAddStock, savingStock,
        transfers, loadTransfers,
        transferProductSearch, setTransferProductSearch,
        transferProductResults, setTransferProductResults,
        transferProductSelected, setTransferProductSelected,
        transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer,
    } = useWarehouseOps(notify, selectedWarehouse, loadWarehouses);

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
        <Button onClick={openNewWarehouse}>+ Nuevo Almacén</Button>
    ) : subTab === "stock" && selectedWarehouse ? (
        <Button
            onClick={openAddStock}
            className="bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
        >
            + Registrar Stock
        </Button>
    ) : subTab === "transferencias" ? (
        <Button onClick={() => setTransferModal(true)}>+ Nueva Transferencia</Button>
    ) : null;

    // ── Título dinámico ───────────────────────────────────────
    const pageTitle = subTab === "transferencias"
        ? "Transferencias"
        : subTab === "ajustes"
        ? "Ajustes de Inventario"
        : subTab === "stock"
        ? `Stock · ${selectedWarehouse?.name || ""}`
        : "Gestión de Almacenes";

    return (
        <Page
            module="MÓDULO DE INVENTARIO"
            title={pageTitle}
            actions={pageActions}
            subheader={<WarehousesHeader subTab={subTab} setSubTab={setSubTab} />}
        >
            {subTab === "almacenes" && (
                <WarehouseGrid
                    warehouses={warehouses}
                    openAssign={openAssign}
                    startEdit={startEdit}
                    setDeleteConfirm={setDeleteConfirm}
                    setSelectedWarehouse={setSelectedWarehouse}
                    setSubTab={setSubTab}
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
                />
            )}

            {subTab === "transferencias" && (
                <TransfersView transfers={transfers} />
            )}

            {subTab === "ajustes" && (
                <AdjustmentsView 
                    selectedWarehouse={selectedWarehouse}
                    notify={notify}
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
            />

            <AddStockModal
                open={addStockModal}
                onClose={() => setAddStockModal(false)}
                selectedWarehouse={selectedWarehouse}
                addStockProduct={addStockProduct}
                clearAddStockProduct={clearAddStockProduct}
                addStockSearch={addStockSearch}
                setAddStockSearch={setAddStockSearch}
                addStockResults={addStockResults}
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
        </Page>
    );
}
