import { useState, useEffect } from "react";
import { useWarehouses } from "../hooks/useWarehouses";
import { useWarehouseOps } from "../hooks/useWarehouseOps";

// Importación de subcomponentes refactorizados
import WarehousesHeader from "./warehouses/WarehousesHeader";
import WarehouseGrid from "./warehouses/WarehouseGrid";
import StockView from "./warehouses/StockView";
import TransfersView from "./warehouses/TransfersView";
import WarehouseModal from "./warehouses/WarehouseModal";
import AddStockModal from "./warehouses/AddStockModal";
import TransferModal from "./warehouses/TransferModal";
import AdjustmentsView from "./warehouses/AdjustmentsView";
import ConfirmModal from "./ui/ConfirmModal";
import Modal from "./ui/Modal";

export default function WarehousesTab({ notify }) {
    const [subTab, setSubTab] = useState("almacenes");
    const [warehouseModal, setWarehouseModal] = useState(false);
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const {
        warehouses, load: loadWarehouses,
        form, setForm, editId, loading,
        save: saveWarehouseAction, remove: deleteWarehouseAction,
        startEdit: startEditHook, cancelEdit: cancelEditHook,
        employees, assignModal, setAssignModal, assignSelected,
        openAssign, toggleAssign, saveAssign
    } = useWarehouses(notify);

    const {
        stock, loadStock, loadingStock,
        stockSearch, setStockSearch, filteredStock,
        editStockModal, setEditStockModal, editStockValue, setEditStockValue, handleEditStock, submitEditStock,
        deleteStockModal, setDeleteStockModal, handleDeleteStock, confirmDeleteStock,
        addStockModal, setAddStockModal, openAddStock,
        addStockForm, setAddStockForm, addStockSearch, setAddStockSearch, addStockResults,
        addStockProduct, setAddStockProduct, selectAddStockProduct, doAddStock, savingStock,
        transfers, loadTransfers,
        transferProductSearch, setTransferProductSearch, transferProductResults, setTransferProductResults,
        transferProductSelected, setTransferProductSelected,
        transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer
    } = useWarehouseOps(notify, selectedWarehouse, loadWarehouses);

    // ── Loaders ───────────────────────────────────────────────
    useEffect(() => { if (subTab === "transferencias") loadTransfers(); }, [subTab, loadTransfers]);
    useEffect(() => {
        if (subTab === "stock" && selectedWarehouse) loadStock(selectedWarehouse.id);
    }, [subTab, selectedWarehouse, loadStock]);

    // ── Handlers ──────────────────────────────────────────────
    const openNewWarehouse = () => { cancelEditHook(); setWarehouseModal(true); };
    const startEdit = (w) => { startEditHook(w); setWarehouseModal(true); };
    const saveWarehouse = async () => { await saveWarehouseAction(); setWarehouseModal(false); };

    return (
        <div className="h-full flex flex-col">
            {/* Header Principal */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                <div>
                    <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">MÓDULO DE INVENTARIO</div>
                    <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">
                        {subTab === "transferencias" ? "Transferencias" : subTab === "stock" ? `Stock · ${selectedWarehouse?.name}` : "Gestión de Almacenes"}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    {subTab === "almacenes" && (
                        <button onClick={openNewWarehouse} className="btn-brand-sm">+ Nuevo Almacén</button>
                    )}
                    {subTab === "stock" && selectedWarehouse && (
                        <button onClick={openAddStock} className="btn-success-sm">+ Registrar Stock</button>
                    )}
                </div>
            </div>

            {/* Navegación de Sub-pestañas */}
            <WarehousesHeader subTab={subTab} setSubTab={setSubTab} />

            {/* Contenido Dinámico */}
            <div className="flex-1 overflow-hidden flex flex-col px-4">
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
                        page={stockPage}
                        setPage={setStockPage}
                        totalItems={totalStockItems}
                        totalPages={Math.ceil(totalStockItems / stockLimit)}
                        limit={stockLimit}
                        loadStock={loadStock}
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
            </div>

            {/* Modales Extraídos */}
            <WarehouseModal
                open={warehouseModal}
                onClose={() => setWarehouseModal(false)}
                form={form} setForm={setForm}
                editId={editId} loading={loading} onSave={saveWarehouse}
            />

            <AddStockModal
                open={addStockModal}
                onClose={() => setAddStockModal(false)}
                selectedWarehouse={selectedWarehouse}
                addStockProduct={addStockProduct}
                clearAddStockProduct={() => setAddStockProduct(null)}
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

            {/* Modal de Asignación (Aún en línea por brevedad, pero listo para extraer) */}
            <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Asignar Empleados" width={420}>
                {/* ... contenido de asignación ... */}
                <div className="flex justify-end gap-2.5 mt-4">
                    <button onClick={saveAssign} className="btn-primary">Guardar</button>
                </div>
            </Modal>

            {/* Confirmaciones */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar almacén?"
                message={`Estás a punto de eliminar "${deleteConfirm?.name}".`}
                onConfirm={async () => { await deleteWarehouseAction(deleteConfirm.id); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
            />
        </div>
    );
}