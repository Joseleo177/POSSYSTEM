import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useCustomers } from "../hooks/useCustomers";
import { fmtBase, fmtSale as fmtSaleHelper } from "../helpers";
import { exportToCSV } from "../utils/exportUtils";
import CustomerModal from "../components/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";
import ConfirmModal from "../components/ConfirmModal";

export default function ClientesPage() {
 const { notify, baseCurrency } = useApp();
 const {
 customers, total, page, setPage,
 search, setSearch,
 typeFilter, setTypeFilter,
 detail, detailSales,
 openDetail, closeDetail, refreshDetail,
 saving, save: saveAction, remove: removeAction,
 LIMIT
 } = useCustomers(notify);

 const fmtPrice = (n) => fmtBase(n, baseCurrency);
 const fmtSale = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

 const [customerModal, setCustomerModal] = useState(false);
 const [customerEditData, setCustomerEditData] = useState(null);
 const [payModal, setPayModal] = useState(null);
 const [deleteConfirm, setDeleteConfirm] = useState(null);

 const openNew = (type = typeFilter) => { setCustomerEditData({ _newType: type }); setCustomerModal(true); };
 const openEdit = (c) => { setCustomerEditData(c); setCustomerModal(true); closeDetail(); };
 const closeModal = () => { setCustomerModal(false); setCustomerEditData(null); };
 const onSave = async (form) => { const ok = await saveAction(form, customerEditData?.id); if (ok) closeModal(); };

 const handleExportStatement = () => {
 const headers = ['Factura', 'Fecha', 'Estado', 'Cargo', 'Abonado', 'Saldo'];
 const rows = detailSales.map(s => [s.id, new Date(s.created_at).toLocaleDateString("es-VE"), s.status.toUpperCase(), s.total, s.amount_paid, s.balance]);
 exportToCSV(`Estado_Cuenta_${detail.name.replace(/\s+/g, '_')}`, rows, headers);
 };

 const renderActions = (c) => (
 <div className="flex justify-end gap-1.5">
 {c.type === "cliente" && (
 <button onClick={() => openDetail(c)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all active:scale-95" title="Ver Detalle">
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
 </button>
 )}
 <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-white transition-all active:scale-95" title="Editar">
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
 </button>
 <button onClick={() => setDeleteConfirm(c)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-95" title="Eliminar">
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
 </button>
 </div>
 );

 const pendingSales = detailSales.filter(s => s.status === 'pendiente' || s.status === 'parcial');
 const paidSales = detailSales.filter(s => s.status === 'pagado');

 // ── LIST VIEW ──────────────────────────────────────────────
 const listView = (
 <div className="h-full flex flex-col">
 {/* Toolbar */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
 <div>
 <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">MÓDULO DE CONTACTOS</div>
 <h1 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">Clientes & Proveedores</h1>
 </div>
 <button onClick={() => openNew("cliente")} className="px-3 py-1.5 bg-brand-500 text-black rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-brand-400 transition-all active:scale-95 shrink-0">
 + Nuevo Contacto
 </button>
 </div>

 {/* Search + filters */}
 <div className="shrink-0 px-4 py-1.5 border-b border-border/20 dark:border-white/5 bg-surface-1/30 dark:bg-white/[0.02] flex items-center gap-2">
 <div className="relative flex-1 max-w-xs">
 <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-content-subtle dark:text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
 <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto..." className="w-full h-7 pl-7 pr-3 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-brand-500/20 outline-none transition-all" />
 </div>
 {[["", "Todos"], ["cliente", "Clientes"], ["proveedor", "Proveedores"]].map(([val, label]) => (
 <button key={val} onClick={() => setTypeFilter(val)}
 className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide transition-all ${typeFilter === val ? "bg-brand-500 text-black" : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/5"}`}>
 {label}
 </button>
 ))}
 </div>

 {/* Table */}
 <div className="flex-1 min-h-0 overflow-auto">
 <table className="w-full text-left border-collapse">
 <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
 <tr className="border-b border-border/30 dark:border-white/5">
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Tipo</th>
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Contacto</th>
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 hidden md:table-cell">Teléfono</th>
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 hidden lg:table-cell">RIF / Cédula</th>
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Balance</th>
 <th className="px-4 py-2 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">Acciones</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/20 dark:divide-white/5">
 {customers.length === 0 ? (
 <tr><td colSpan={6} className="p-10 text-center text-[11px] font-black uppercase tracking-wide opacity-20">Sin contactos registrados</td></tr>
 ) : customers.map(c => (
 <tr key={c.id} className="group hover:bg-surface-1/50 dark:hover:bg-white/[0.03] transition-colors">
 <td className="px-4 py-2">
 <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${c.type === "proveedor" ? "bg-violet-500/10 text-violet-500 border-violet-500/20" : "bg-info/10 text-info border-info/20"}`}>
 {c.type === "proveedor" ? "Proveedor" : "Cliente"}
 </span>
 </td>
 <td className="px-4 py-2">
 <div className="flex items-center gap-2.5">
 <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black border border-white/10 shrink-0 ${c.type === "proveedor" ? "bg-violet-500/10 text-violet-500" : "bg-brand-500/10 text-brand-500"}`}>
 {c.name.charAt(0).toUpperCase()}
 </div>
 <div>
 <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight leading-none group-hover:text-brand-500 transition-colors">{c.name}</div>
 <div className="text-[11px] text-content-subtle dark:text-white/30 font-bold uppercase tracking-wide mt-0.5">ID: {c.code || c.id}</div>
 </div>
 </div>
 </td>
 <td className="px-4 py-2 hidden md:table-cell"><span className="text-[11px] font-medium text-content-subtle dark:text-white/30">{c.phone || "—"}</span></td>
 <td className="px-4 py-2 hidden lg:table-cell"><span className="text-[11px] font-black bg-surface-3 dark:bg-white/5 px-2 py-0.5 rounded border border-border/30 dark:border-white/5 text-content-subtle tracking-wider">{c.rif || "S/N"}</span></td>
 <td className="px-4 py-2">
 {c.type === "proveedor"
 ? <span className="text-[11px] text-content-subtle dark:text-white/30 italic">{c.tax_name || "—"}</span>
 : parseFloat(c.total_debt || 0) > 0
 ? <span className="font-black text-danger bg-danger/10 px-2 py-0.5 rounded border border-danger/20 text-[11px] tabular-nums">-{fmtPrice(c.total_debt)}</span>
 : <span className="flex items-center gap-1 text-[11px] font-black tracking-wide uppercase text-success"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"/>Al día</span>
 }
 </td>
 <td className="px-4 py-2">{renderActions(c)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Pagination */}
 {total > LIMIT && (
 <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border/20 dark:border-white/5">
 <span className="text-[11px] font-black uppercase tracking-wide opacity-30">{total} contactos</span>
 <div className="flex items-center gap-1">
 <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="w-6 h-6 rounded flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/20 text-content-subtle hover:text-brand-500 disabled:opacity-20 transition-all">
 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
 </button>
 <span className="text-[11px] font-black opacity-40 px-1">{page}</span>
 <button onClick={() => setPage(p => p+1)} disabled={customers.length < LIMIT} className="w-6 h-6 rounded flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/20 text-content-subtle hover:text-brand-500 disabled:opacity-20 transition-all">
 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
 </button>
 </div>
 </div>
 )}
 </div>
 );

 // ── DETAIL VIEW ────────────────────────────────────────────
 const detailView = detail && (
 <div className="h-full flex flex-col">
 {/* Header */}
 <div className="shrink-0 px-4 pt-3 pb-2 flex justify-between items-center border-b border-border/30 dark:border-white/5 print-hidden">
 <button onClick={closeDetail} className="flex items-center gap-1.5 text-[11px] font-black text-content-subtle uppercase tracking-wide hover:text-brand-500 transition-all active:scale-95">
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
 Volver al listado
 </button>
 <div className="flex gap-2">
 <button onClick={handleExportStatement} className="px-2.5 py-1 bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/5 rounded-lg text-[11px] font-black uppercase tracking-wide hover:text-brand-500 transition-all">CSV</button>
 <button onClick={() => window.print()} className="px-2.5 py-1 bg-info text-white rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-info/80 transition-all">Imprimir</button>
 </div>
 </div>

 <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
 {/* Print header */}
 <div className="hidden print-force-break mb-4 text-center text-black">
 <h1 className="text-xl font-black uppercase tracking-tight">Estado de Cuenta</h1>
 <p className="text-xs mt-1 tracking-wide font-bold opacity-70">{detail.name} — RIF: {detail.rif || 'S/N'}</p>
 <p className="text-[11px] uppercase font-black tracking-wide opacity-50 mt-1">Fecha: {new Date().toLocaleDateString("es-VE")}</p>
 </div>

 {/* Summary card */}
 <div className="card-premium p-3 mb-3">
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
 <div className="flex items-center gap-3">
 <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shadow border-2 border-white/10 shrink-0 ${detail.type === "proveedor" ? "bg-violet-500/10 text-violet-500" : "bg-info/10 text-info"}`}>
 {detail.name.charAt(0).toUpperCase()}
 </div>
 <div>
 <h2 className="text-sm font-black text-content dark:text-white tracking-tight uppercase leading-none mb-1">{detail.name}</h2>
 <div className="flex flex-wrap gap-1">
 {detail.rif && <span className="text-[11px] font-black bg-surface-2 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/50 text-content-subtle uppercase tracking-wider">RIF: {detail.rif}</span>}
 {detail.phone && <span className="text-[11px] font-black bg-surface-2 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/50 text-content-subtle tracking-wider">{detail.phone}</span>}
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-2">
 <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-border/30">
 <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-0.5">Transacciones</div>
 <div className="text-sm font-black text-warning tabular-nums">{detail.total_purchases}</div>
 </div>
 <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-border/30">
 <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-0.5">Facturación</div>
 <div className="text-sm font-black text-success tabular-nums">{fmtPrice(detail.total_spent)}</div>
 </div>
 </div>

 <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-brand-500/10 text-right">
 <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-1">SALDO PENDIENTE</div>
 {parseFloat(detail.total_debt || 0) > 0
 ? <div className="text-xl font-black text-danger tabular-nums">{fmtPrice(detail.total_debt)}</div>
 : <div className="text-sm font-black text-success flex items-center justify-end gap-1.5">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
 SALDO AL DÍA
 </div>
 }
 {pendingSales.length > 0 && <div className="text-[11px] font-black text-danger/60 mt-1 uppercase tracking-wide">{pendingSales.length} pendiente{pendingSales.length > 1 ? "s" : ""}</div>}
 </div>
 </div>
 </div>

 {/* Pending sales */}
 {pendingSales.length > 0 && (
 <div className="mb-3">
 <div className="flex items-center gap-3 mb-2">
 <h3 className="text-[11px] font-black text-danger uppercase tracking-wide whitespace-nowrap">Cuentas por Cobrar</h3>
 <div className="h-px flex-1 bg-danger/10 rounded-full"/>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
 {pendingSales.map(sale => (
 <div key={sale.id} className="bg-white dark:bg-surface-dark-2 border border-border/50 hover:border-danger/30 transition-all rounded-xl p-3 shadow-sm">
 <div className="flex justify-between items-start mb-2">
 <div>
 <div className="text-[11px] font-black text-content-subtle mb-0.5 tracking-wide uppercase opacity-60">Factura #{sale.id}</div>
 <div className="text-[11px] font-bold text-content-subtle">{new Date(sale.created_at).toLocaleDateString("es-VE")}</div>
 </div>
 <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${sale.status === "parcial" ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20"}`}>
 {sale.status === "parcial" ? "Parcial" : "Pendiente"}
 </span>
 </div>
 <div className="flex items-end justify-between border-t border-border/30 pt-2">
 <div>
 <div className="text-[11px] text-content-subtle font-bold line-clamp-1 opacity-50 mb-1">{sale.items?.map(i => i.name).join(", ") || "Venta"}</div>
 <div className="flex items-center gap-3">
 <div><div className="text-[11px] text-content-subtle font-black uppercase">Cargo</div><div className="text-[11px] font-bold tabular-nums">{fmtSale(sale, sale.total)}</div></div>
 {sale.amount_paid > 0 && <div><div className="text-[11px] text-success font-black uppercase">Abonado</div><div className="text-[11px] font-bold text-success tabular-nums">{fmtSale(sale, sale.amount_paid)}</div></div>}
 </div>
 </div>
 <div className="text-right">
 <div className="text-[11px] font-black text-danger uppercase mb-0.5">Saldo</div>
 <div className="text-sm font-black text-danger tabular-nums">{fmtSale(sale, sale.balance)}</div>
 </div>
 </div>
 <button onClick={() => setPayModal(sale)} className="w-full mt-2 py-1.5 bg-success/10 text-success border border-success/20 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-success hover:text-black transition-all active:scale-95">
 Registrar Cobro
 </button>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Paid sales */}
 <div className="flex items-center gap-3 mb-2">
 <h3 className="text-[11px] font-black text-content-subtle uppercase tracking-wide whitespace-nowrap opacity-60">Historial de Pagos</h3>
 <div className="h-px flex-1 bg-border/30 rounded-full"/>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
 {paidSales.length === 0
 ? <div className="col-span-full text-center text-content-subtle/40 py-8 text-[11px] font-black uppercase tracking-wide">Sin pagos finalizados</div>
 : paidSales.map(sale => (
 <div key={sale.id} className="bg-white dark:bg-surface-dark-3 border border-border/40 rounded-xl p-3 hover:bg-surface-2 dark:hover:bg-surface-dark transition-all">
 <div className="flex justify-between items-center mb-1.5">
 <span className="text-[11px] font-black text-content-subtle/60 uppercase tracking-wide">#{sale.id}</span>
 <span className="px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-black uppercase border border-success/20">PAGADO</span>
 </div>
 <div className="text-[11px] font-bold text-content-muted line-clamp-1 opacity-60 mb-1">{sale.items?.map(i => i.name).join(", ") || "Venta General"}</div>
 <div className="flex justify-between items-center">
 <span className="text-[11px] text-content-subtle/70 italic">{new Date(sale.created_at).toLocaleDateString("es-VE")}</span>
 <span className="text-sm font-black text-success tabular-nums">{fmtSale(sale, sale.total)}</span>
 </div>
 </div>
 ))
 }
 </div>

 {payModal && <PaymentFormModal sale={payModal} onClose={() => setPayModal(null)} onSuccess={() => { setPayModal(null); refreshDetail(); }} />}
 </div>
 </div>
 );

 return (
 <div className="h-full overflow-hidden">
 {!detail && listView}
 {detail && detailView}

 <CustomerModal open={customerModal} onClose={closeModal} onSave={onSave} editData={customerEditData} loading={saving} />
 <ConfirmModal
 isOpen={!!deleteConfirm}
 title={`¿Eliminar ${deleteConfirm?.type === "proveedor" ? "proveedor" : "cliente"}?`}
 message={`Estás a punto de eliminar a "${deleteConfirm?.name}". Esta acción no se puede deshacer.`}
 onConfirm={async () => { await removeAction(deleteConfirm.id, deleteConfirm.type); setDeleteConfirm(null); }}
 onCancel={() => setDeleteConfirm(null)}
 type="danger"
 confirmText="Sí, Eliminar Permanentemente"
 cancelText="No, Mantener"
 />
 </div>
 );
}
