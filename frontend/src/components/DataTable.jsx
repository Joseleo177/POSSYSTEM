import React from "react";

export default function DataTable({
  columns,
  data,
  keyExtractor = (item) => item.id,
  emptyMessage = "No hay datos para mostrar",
  emptyIcon = "📭",
  pagination = null // { page, limit, total, onPageChange }
}) {
  const hasPagination = pagination && pagination.total > 0;
  const totalPages = hasPagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-surface-dark-2 rounded-2xl border-2 border-dashed border-border dark:border-border-dark py-24 text-center">
        <div className="text-4xl mb-4">{emptyIcon}</div>
        <div className="text-content-subtle font-bold uppercase tracking-widest text-xs">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface-dark-2 rounded-2xl shadow-card border border-border dark:border-border-dark overflow-hidden transition-all duration-300">
      <div className="overflow-x-auto">
        <table className="table-pos w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-info/30 text-info dark:text-blue-400 bg-surface-2/50 dark:bg-surface-dark-3/50">
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={`text-left py-4 px-4 text-[10px] font-black uppercase tracking-[2px] ${col.headerClassName || ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 dark:divide-border-dark/40">
            {data.map((row, rowIndex) => (
              <tr
                key={keyExtractor(row, rowIndex)}
                className="group hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors duration-150"
              >
                {columns.map((col, colIndex) => (
                  <td key={col.key || colIndex} className={`py-4 px-4 ${col.cellClassName || ""}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {hasPagination && totalPages > 1 && (
        <div className="border-t border-border dark:border-border-dark p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-1 dark:bg-surface-dark-1">
          <div className="text-xs font-bold text-content-muted">
            Mostrando <span className="text-info">{((pagination.page - 1) * pagination.limit) + 1}</span> a <span className="text-info">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> de <span className="text-info">{pagination.total}</span> registros
          </div>
          <div className="flex bg-surface-2 dark:bg-surface-dark-3 rounded-lg p-1 border border-border/40 dark:border-border-dark/40">
            <button
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-3 transition-colors"
            >
              Anterior
            </button>
            
            <div className="px-4 py-2 flex items-center justify-center text-xs font-bold text-content-subtle min-w-[3rem]">
              {pagination.page} / {totalPages}
            </div>

            <button
              onClick={() => pagination.onPageChange(Math.min(totalPages, pagination.page + 1))}
              disabled={pagination.page === totalPages}
              className="px-4 py-2 rounded-md text-xs font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-3 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
