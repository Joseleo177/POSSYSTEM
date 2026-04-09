import { useState, useEffect } from "react";
import { useWarehouses } from "../hooks/useWarehouses";
import { useWarehouseOps } from "../hooks/useWarehouseOps";
import { fmtDate, fmtQty } from "../helpers";
import ConfirmModal from "./ConfirmModal";
import Modal from "./Modal";

export default function WarehousesTab({ notify, currentEmployee }) {
 const [subTab, setSubTab] = useState("almacenes");
 const [warehouseModal, setWarehouseModal] = useState(false);
 const [selectedWarehouse, setSelectedWarehouse] = useState(null);

 // Modales de confirmación
 const [deleteConfirm, setDeleteConfirm] = useState(null); // Almacén a eliminar

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
 addStockProduct, selectAddStockProduct, doAddStock, savingStock,
 transfers, loadTransfers, products,
 transferForm, setTransferForm, transferModal, setTransferModal, loadingTransfer, doTransfer
 } = useWarehouseOps(notify, selectedWarehouse, loadWarehouses);

 // ── Conditional Loaders ───────────────────────────────────
 useEffect(() => { if (subTab === "transferencias") loadTransfers(); }, [subTab, loadTransfers]);
 useEffect(() => {
 if (subTab === "stock" && selectedWarehouse) loadStock(selectedWarehouse.id);
 }, [subTab, selectedWarehouse, loadStock]);

 // ── UI Wrappers ───────────────────────────────────────────
 const openNewWarehouse = () => {
 cancelEditHook();
 setWarehouseModal(true);
 };

 const startEdit = (w) => {
 startEditHook(w);
 setWarehouseModal(true);
 };

 const cancelEdit = () => {
 cancelEditHook();
 setWarehouseModal(false);
 };

 const saveWarehouse = async () => {
 await saveWarehouseAction();
 if (!editId) setWarehouseModal(false); // Close if it was a new creation
 else setWarehouseModal(false); // also close if edit
 };

 return (
 <div className="h-full flex flex-col">

 {/* ── Header principal ── */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
 <div>
 <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">MÓDULO DE INVENTARIO</div>
 <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">
 {subTab === "transferencias" ? "Transferencias" : subTab === "stock" ? `Stock · ${selectedWarehouse?.name || ""}` : "Gestión de Almacenes"}
 </h1>
 </div>
 <div className="flex items-center gap-2">
 {subTab === "almacenes" && (
 <button onClick={openNewWarehouse} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-brand-400 transition-all active:scale-95 shrink-0">
 + Nuevo Almacén
 </button>
 )}
 {subTab === "stock" && selectedWarehouse && (
 <button onClick={openAddStock} className="px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-success hover:text-black transition-all active:scale-95">
 + Registrar Stock
 </button>
 )}
 {subTab === "transferencias" && (
 <button onClick={() => setTransferModal(true)} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-brand-400 transition-all active:scale-95">
 + Nueva Transferencia
 </button>
 )}
 </div>
 </div>

 {/* ── Sub-tabs ── */}
 <div className="shrink-0 px-4 py-1.5 flex items-center gap-1 border-b border-border/20 dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02]">
 {[["almacenes", "Almacenes"], ["transferencias", "Transferencias"]].map(([key, label]) => (
 <button
 key={key}
 onClick={() => setSubTab(key)}
 className={`px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-wide whitespace-nowrap transition-all ${
 subTab === key || (key === "almacenes" && subTab === "stock")
 ? "bg-brand-500 text-black shadow-sm"
 : "text-content-muted dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5"
 }`}
 >
 {label}
 </button>
 ))}
 </div>

 {/* ── ALMACENES ── */}
 {subTab === "almacenes" && (
 <div className="flex-1 overflow-auto px-4 py-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
 {warehouses.map(w => (
 <div
 key={w.id}
 className={[
 "group relative bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-xl p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:shadow-brand-500/10 hover:-translate-y-0.5 overflow-hidden",
 w.active ? "opacity-100" : "opacity-50 grayscale",
 ].join(" ")}
 >
 {/* Decoración de fondo */}
 <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-brand-500/10 transition-colors"></div>

 <div className="relative z-10">
 <div className="flex justify-between items-start mb-3">
 <div className="flex-1 min-w-0 pr-4">
 <div className="font-black text-sm text-content dark:text-heading-dark uppercase tracking-wider truncate group-hover:text-brand-500 transition-colors">{w.name}</div>
 {w.description && <div className="text-[11px] text-content-subtle mt-1 italic trunacte">{w.description}</div>}
 </div>
 <span className={[
 "text-[11px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-xl border",
 w.active
 ? "text-success border-success/30 bg-success/5"
 : "text-danger border-danger/30 bg-danger/5",
 ].join(" ")}>
 {w.active ? "Activo" : "Inactivo"}
 </span>
 </div>

 <div className="grid grid-cols-3 gap-2 mb-4">
 <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-xl text-center border border-border/30 dark:border-white/5">
 <div className="text-xl font-black text-brand-500">{w.product_count || 0}</div>
 <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Productos</div>
 </div>
 <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-xl text-center border border-border/30 dark:border-white/5">
 <div className="text-xl font-black text-info">{parseFloat(w.total_stock || 0).toFixed(0)}</div>
 <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Items</div>
 </div>
 <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-xl text-center border border-border/30 dark:border-white/5">
 <div className="text-xl font-black text-violet-500">{(w.assigned_employees || []).length}</div>
 <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Empleados</div>
 </div>
 </div>

 <div className="flex flex-wrap gap-2 pt-4 border-t border-border/20">
 <button
 onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }}
 className="flex-1 min-w-[100px] py-2.5 rounded-xl bg-info/10 text-info text-[11px] font-black uppercase tracking-wide hover:bg-info hover:text-black transition-all"
 >
 Stock
 </button>
 <button
 onClick={() => openAssign(w)}
 className="flex-1 min-w-[100px] py-2.5 rounded-xl bg-violet-500/10 text-violet-400 text-[11px] font-black uppercase tracking-wide hover:bg-violet-500 hover:text-black transition-all"
 >
 Empleados
 </button>
 <button
 onClick={() => startEdit(w)}
 className="p-2.5 rounded-xl bg-surface-3 dark:bg-surface-dark-3 text-content-subtle hover:text-brand-500 transition-all border border-border/20"
 title="Editar"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
 </button>
 <button
 onClick={() => setDeleteConfirm(w)}
 className="p-2.5 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
 title="Eliminar"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
 </button>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* ── STOCK ── */}
 {subTab === "stock" && (
 <div className="flex-1 overflow-hidden flex flex-col px-4 py-3">
 {/* Barra de búsqueda */}
 {selectedWarehouse && (
 <div className="shrink-0 mb-3">
 <input
 value={stockSearch}
 onChange={e => setStockSearch(e.target.value)}
 placeholder="Filtrar producto..."
 className="w-full max-w-xs h-8 px-3 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
 />
 </div>
 )}

 {!selectedWarehouse ? (
 <div className="card-premium py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide opacity-40">
 Selecciona un almacén para gestionar inventario
 </div>
 ) : loadingStock ? (
 <div className="py-20 text-center text-brand-500 animate-pulse text-[11px] font-black uppercase tracking-wide">Sincronizando existencias...</div>
 ) : (
 <div className="card-premium overflow-auto flex-1">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-surface-2 dark:bg-surface-dark-2">
 {["Producto", "Categoría", "Stock Actual", "P. Venta", "Acciones"].map(h => (
 <th key={h} className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40 dark:divide-white/5">
 {filteredStock.length === 0 ? (
 <tr>
 <td colSpan={5} className="px-6 py-20 text-center">
 <div className="flex flex-col items-center gap-3">
 <span className="text-4xl opacity-10">?</span>
 <div className="text-content-subtle text-xs font-bold uppercase tracking-wide">No se encontraron productos</div>
 <button onClick={openAddStock} className="text-brand-500 font-black text-[11px] uppercase tracking-wide underline underline-offset-4">Agregar Stock</button>
 </div>
 </td>
 </tr>
 ) : (
 filteredStock.map((s) => (
 <tr key={s.product_id} className="group hover:bg-brand-500/[0.02] transition-colors">
 <td className="px-6 py-4">
 <div className="flex flex-col">
 <span className="text-sm font-black text-content dark:text-heading-dark tracking-tight uppercase group-hover:text-brand-500 transition-colors">{s.product_name}</span>
 {s.is_combo && <span className="w-fit mt-1 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wide rounded-md">Combo Virtual</span>}
 </div>
 </td>
 <td className="px-6 py-4">
 <span className="text-[11px] font-bold text-content-subtle uppercase">{s.category_name || "General"}</span>
 </td>
 <td className="px-6 py-4">
 <div className="flex items-center gap-2">
 <span className={[
 "text-lg font-black",
 parseFloat(s.qty) <= 0 ? "text-danger" : (parseFloat(s.qty) <= 5 ? "text-warning" : "text-success")
 ].join(" ")}>
 {fmtQty(s.qty)}
 <span className="text-[11px] ml-1 opacity-40 uppercase">{s.unit || "uds"}</span>
 </span>
 </div>
 </td>
 <td className="px-6 py-4 font-black text-brand-500 text-sm">${parseFloat(s.price || 0).toFixed(2)}</td>
 <td className="px-6 py-4">
 <div className="flex items-center gap-2">
 <button
 onClick={() => handleEditStock(s)}
 className="p-2.5 rounded-xl bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black transition-all"
 title="Ajustar"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
 </button>
 <button
 onClick={() => handleDeleteStock(s)}
 className="p-2.5 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
 title="Retirar"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
 </button>
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 )}
 </div>
 )}

 {/* ── TRANSFERENCIAS ── */}
 {subTab === "transferencias" && (
 <div className="flex-1 overflow-hidden flex flex-col px-4 py-3">
 <div className="card-premium overflow-auto flex-1">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-surface-2 dark:bg-surface-dark-2">
 {["Fecha", "Producto", "Origen", "Destino", "Cantidad", "Responsable"].map(h => (
 <th key={h} className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40 dark:divide-white/5">
 {transfers.length === 0 ? (
 <tr>
 <td colSpan={6} className="px-6 py-20 text-center text-content-subtle text-xs font-bold uppercase tracking-wide italic">
 No se han registrado movimientos entre almacenes
 </td>
 </tr>
 ) : (
 transfers.map((t) => (
 <tr key={t.id} className="group hover:bg-brand-500/[0.02] transition-colors">
 <td className="px-6 py-5 text-[11px] font-bold text-content-subtle whitespace-nowrap">
 {fmtDate(t.created_at)}
 </td>
 <td className="px-6 py-5 font-black text-content dark:text-heading-dark text-xs uppercase tracking-tight">
 {t.product_name}
 </td>
 <td className="px-6 py-5">
 {t.from_warehouse_name ? (
 <span className="px-2.5 py-1 rounded-lg bg-danger/5 text-danger text-[11px] font-black uppercase border border-danger/10">
 {t.from_warehouse_name}
 </span>
 ) : (
 <span className="text-[11px] text-content-subtle uppercase italic">Entrada Externa</span>
 )}
 </td>
 <td className="px-6 py-5">
 <span className="px-2.5 py-1 rounded-lg bg-success/5 text-success text-[11px] font-black uppercase border border-success/10">
 {t.to_warehouse_name}
 </span>
 </td>
 <td className="px-6 py-5">
 <span className="text-sm font-black text-brand-500">{fmtQty(t.qty)}</span>
 </td>
 <td className="px-6 py-5">
 <div className="text-[11px] font-bold text-content dark:text-heading-dark uppercase">{t.employee_name || "Sistema"}</div>
 {t.note && <div className="text-[11px] text-content-subtle mt-0.5 truncate max-w-[150px]">{t.note}</div>}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* ── MODAL: Nueva Transferencia ── */}
 <Modal open={transferModal} onClose={() => { setTransferModal(false); setTransferForm({ from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" }); }} title="Nueva Transferencia" width={520}>
 <div className="grid grid-cols-2 gap-3 mb-3">
 <div>
 <div className="label mb-1">Origen *</div>
 <select value={transferForm.from_warehouse_id} onChange={e => setTransferForm(p => ({ ...p, from_warehouse_id: e.target.value, to_warehouse_id: p.to_warehouse_id === e.target.value ? "" : p.to_warehouse_id }))} className="input">
 <option value="">— Seleccionar origen</option>
 {warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
 </select>
 </div>
 <div>
 <div className="label mb-1">Destino *</div>
 <select value={transferForm.to_warehouse_id} onChange={e => setTransferForm(p => ({ ...p, to_warehouse_id: e.target.value }))} className="input">
 <option value="">— Seleccionar destino</option>
 {warehouses.filter(w => w.active && w.id !== parseInt(transferForm.from_warehouse_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
 </select>
 </div>
 </div>
 <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
 <div>
 <div className="label mb-1">Producto *</div>
 <select value={transferForm.product_id} onChange={e => setTransferForm(p => ({ ...p, product_id: e.target.value }))} className="input">
 <option value="">— Seleccionar producto</option>
 {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
 </select>
 </div>
 <div>
 <div className="label mb-1">Cantidad *</div>
 <input type="number" min="0.001" step="0.001" value={transferForm.qty} onChange={e => setTransferForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" className="input" />
 </div>
 </div>
 <div className="mb-4">
 <div className="label mb-1">Nota (opcional)</div>
 <input value={transferForm.note} onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))} placeholder="ej. Reposición semanal de tienda" className="input" />
 </div>
 <div className="flex gap-2.5">
 <button onClick={doTransfer} disabled={loadingTransfer} className={`btn-md ${loadingTransfer ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"}`}>
 {loadingTransfer ? "Transfiriendo..." : "Registrar transferencia"}
 </button>
 <button onClick={() => { setTransferModal(false); setTransferForm({ from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" }); }} className="btn-sm btn-secondary">Cancelar</button>
 </div>
 </Modal>

 {/* ── MODAL: Crear / Editar Almacén ── */}
 <Modal open={warehouseModal} onClose={cancelEdit} title={editId ? "Editar Almacén" : "Nuevo Almacén"} width={480}>
 <div className="grid grid-cols-2 gap-3 mb-3">
 <div>
 <div className="label mb-1">Nombre *</div>
 <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ej. Depósito Central" className="input" autoFocus />
 </div>
 <div>
 <div className="label mb-1">Orden</div>
 <input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} className="input" />
 </div>
 </div>
 <div className="mb-3">
 <div className="label mb-1">Descripción</div>
 <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="ej. Almacén principal" className="input" />
 </div>
 {editId && (
 <div className="mb-4">
 <label className="flex items-center gap-2 text-[13px] cursor-pointer">
 <input type="checkbox" checked={form.active ?? true} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
 <span className="text-content-muted dark:text-content-dark-muted">Activo</span>
 </label>
 </div>
 )}
 <div className="flex gap-2.5">
 <button onClick={saveWarehouse} disabled={loading} className="btn-md btn-primary">
 {loading ? "Guardando..." : editId ? "Guardar cambios" : "Crear almacén"}
 </button>
 <button onClick={cancelEdit} className="btn-sm btn-secondary">Cancelar</button>
 </div>
 </Modal>

 {/* ── MODAL: Agregar producto al almacén ── */}
 <Modal open={addStockModal} onClose={() => setAddStockModal(false)} title="Agregar Producto al Almacén" width={480}>
 <p className="text-xs text-content-muted dark:text-content-dark-muted mb-4">
 Almacén: <b className="text-content dark:text-content-dark">{selectedWarehouse?.name}</b>
 </p>
 <div className="mb-3">
 <div className="label mb-1">Producto *</div>
 {addStockProduct ? (
 <div className="flex items-center gap-2.5 bg-info/10 border border-info/40 rounded-lg px-3 py-2">
 <div className="flex-1">
 <div className="text-xs font-bold text-info">{addStockProduct.name}</div>
 <div className="text-[11px] text-content-muted dark:text-content-dark-muted">{addStockProduct.category_name || "Sin categoría"} · Stock: {addStockProduct.stock}</div>
 </div>
 <button onClick={() => { setAddStockProduct(null); setAddStockForm(EMPTY_ADD_STOCK); }} className="p-1.5 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all">
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
 </button>
 </div>
 ) : (
 <div className="relative">
 <input value={addStockSearch} onChange={e => setAddStockSearch(e.target.value)} placeholder="Buscar producto..." className="input" />
 {addStockResults.length > 0 && (
 <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-10 max-h-48 overflow-y-auto shadow-xl">
 {addStockResults.map(p => (
 <div key={p.id} onClick={() => selectAddStockProduct(p)} className="px-3 py-2 cursor-pointer border-b border-surface-3 dark:border-surface-dark-3 text-xs hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors">
 <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
 <div className="text-[11px] text-content-muted dark:text-content-dark-muted">{p.category_name || "Sin categoría"} · Stock: {p.stock} {p.unit}</div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 <div className="mb-4">
 <div className="label mb-1">Cantidad inicial *</div>
 <input type="number" min="0" step="0.001" value={addStockForm.qty} onChange={e => setAddStockForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" className="input" />
 <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1">Puedes ingresar 0 para registrar sin stock inicial</div>
 </div>
 <div className="flex gap-2.5">
 <button onClick={doAddStock} disabled={savingStock} className={`btn-md ${savingStock ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-success"}`}>
 {savingStock ? "Guardando..." : "Agregar al almacén"}
 </button>
 <button onClick={() => setAddStockModal(false)} className="btn-sm btn-secondary">Cancelar</button>
 </div>
 </Modal>

 {/* ── MODAL: Asignar empleados ── */}
 <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Asignar Empleados" width={420}>
 <p className="text-xs text-content-muted dark:text-content-dark-muted mb-3">
 Almacén: <b className="text-content dark:text-content-dark">{assignModal?.name}</b>
 </p>
 <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto mb-4">
 {employees.map(emp => (
 <label key={emp.id} className={["flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-lg border transition-colors", assignSelected.includes(emp.id) ? "bg-info/10 border-info/40" : "bg-transparent border-surface-3 dark:border-surface-dark-3 hover:border-content-muted dark:hover:border-content-dark-muted"].join(" ")}>
 <input type="checkbox" checked={assignSelected.includes(emp.id)} onChange={() => toggleAssign(emp.id)} />
 <div>
 <div className={`text-xs font-bold ${assignSelected.includes(emp.id) ? "text-info" : "text-content dark:text-content-dark"}`}>{emp.full_name}</div>
 <div className="text-[11px] text-content-muted dark:text-content-dark-muted">{emp.role_label || emp.role} · @{emp.username}</div>
 </div>
 </label>
 ))}
 </div>
 <div className="flex gap-2.5">
 <button onClick={saveAssign} className="btn-md btn-primary">Guardar</button>
 <button onClick={() => setAssignModal(null)} className="btn-sm btn-secondary">Cancelar</button>
 </div>
 </Modal>

 {/* ── MODAL: Editar Stock ── */}
 <Modal open={!!editStockModal} onClose={() => setEditStockModal(null)} title="Editar Stock" width={340}>
 <form onSubmit={submitEditStock}>
 <p className="text-xs text-content-muted dark:text-content-dark-muted mb-3">
 Producto: <b className="text-content dark:text-content-dark">{editStockModal?.product_name}</b>
 </p>
 <div className="mb-4">
 <label className="label mb-1">Nueva cantidad *</label>
 <input autoFocus type="number" step="0.001" min="0" value={editStockValue} onChange={e => setEditStockValue(e.target.value)} required className="input w-full" />
 </div>
 <div className="flex gap-2.5">
 <button type="submit" className="btn-md btn-primary">Guardar</button>
 <button type="button" onClick={() => setEditStockModal(null)} className="btn-sm btn-secondary">Cancelar</button>
 </div>
 </form>
 </Modal>

 {/* ── MODALES DE CONFIRMACIÓN ── */}
 <ConfirmModal
 isOpen={!!deleteConfirm}
 title="¿Eliminar almacén?"
 message={`Estás a punto de eliminar "${deleteConfirm?.name}". Esta acción no se puede deshacer y solo es posible si el almacén no tiene stock registrado.`}
 onConfirm={async () => {
 await deleteWarehouseAction(deleteConfirm.id);
 setDeleteConfirm(null);
 }}
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
 </div>
 );
}
