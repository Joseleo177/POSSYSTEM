import React from "react";

export default function DataTable({
 columns,
 data,
 keyExtractor = (item) => item.id,
 emptyMessage = "No hay datos para mostrar",
 emptyIcon = "",
 pagination = null // { page, limit, total, onPageChange }
}) {
 const hasPagination = pagination && pagination.total > 0;
 const totalPages = hasPagination ? Math.ceil(pagination.total / pagination.limit) : 1;

 if (!data || data.length === 0) {
 return (
 <div className="py-24 text-center animate-in fade-in zoom-in-95 duration-500">
 <div className="text-5xl mb-4 drop-shadow-sm">{emptyIcon}</div>
 <div className="text-content-subtle font-black uppercase tracking-wide text-[11px] opacity-60">
 {emptyMessage}
 </div>
 </div>
 );
 }

 return (
 <div className="w-full overflow-hidden transition-all duration-500">
 <div className="overflow-x-auto overflow-y-hidden">
 <table className="table-pos w-full border-collapse">
 <thead>
 <tr>
 {columns.map((col, idx) => (
 <th
 key={col.key || idx}
 className={`text-left py-5 px-6 text-[11px] font-black uppercase tracking-wide text-content-subtle/80 bg-surface-2/30 dark:bg-surface-dark-3/30 border-b border-border/60 dark:border-border-dark/60 ${col.headerClassName || ""}`}
 >
 {col.label}
 </th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-border/30 dark:divide-border-dark/30">
 {data.map((row, rowIndex) => (
 <tr
 key={keyExtractor(row, rowIndex)}
 className="group hover:bg-surface-2/40 dark:hover:bg-surface-dark-3/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
 style={{ animationDelay: `${rowIndex * 40}ms` }}
 >
 {columns.map((col, colIndex) => (
 <td key={col.key || colIndex} className={`py-5 px-6 text-sm ${col.cellClassName || ""}`}>
 {col.render ? col.render(row) : <span className="font-medium text-content/90 dark:text-content-dark">{row[col.key]}</span>}
 </td>
 ))}
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {/* Pagination Controls - Commercial Grade */}
 {hasPagination && totalPages > 1 && (
 <div className="border-t border-border/40 dark:border-border-dark/40 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-2/20 dark:bg-surface-dark-3/10">
 <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide opacity-70">
 Mostrando <span className="text-brand-500 font-black">{((pagination.page - 1) * pagination.limit) + 1}</span> — <span className="text-brand-500 font-black">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> <span className="mx-1">de</span> <span className="text-content font-black dark:text-content-dark">{pagination.total}</span> registros
 </div>

 <div className="flex items-center gap-2 bg-white dark:bg-surface-dark-3 p-1.5 rounded-2xl border border-border/60 shadow-sm">
 <button
 onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
 disabled={pagination.page === 1}
 className="w-10 flex items-center justify-center rounded-xl bg-surface-2 dark:bg-surface-dark-2 text-content-muted disabled:opacity-20 disabled:pointer-events-none hover:bg-brand-500 hover:text-white transition-all active:scale-90"
 title="Anterior"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
 </button>

 <div className="px-5 flex items-center justify-center text-xs font-black text-content-muted dark:text-content-dark-muted tracking-wide min-w-[5rem]">
 PÁGINA {pagination.page} <span className="mx-2 opacity-30">/</span> {totalPages}
 </div>

 <button
 onClick={() => pagination.onPageChange(Math.min(totalPages, pagination.page + 1))}
 disabled={pagination.page === totalPages}
 className="w-10 flex items-center justify-center rounded-xl bg-surface-2 dark:bg-surface-dark-2 text-content-muted disabled:opacity-20 disabled:pointer-events-none hover:bg-brand-500 hover:text-white transition-all active:scale-90"
 title="Siguiente"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
 </button>
 </div>
 </div>
 )}
 </div>
 );
}
