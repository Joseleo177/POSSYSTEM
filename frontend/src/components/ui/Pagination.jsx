export default function Pagination({ page, totalPages, total, limit, onPageChange }) {
    if (!totalPages || totalPages <= 1) return null;

    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    return (
        <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
            <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                Mostrando <span className="text-content dark:text-white">{startItem}–{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <button
                    disabled={page === 1}
                    onClick={() => onPageChange(1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                >«</button>
                <button
                    disabled={page === 1}
                    onClick={() => onPageChange(page - 1)}
                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                >Anterior</button>
                <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                    Pág {page}/{totalPages}
                </div>
                <button
                    disabled={page === totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                >Siguiente</button>
                <button
                    disabled={page === totalPages}
                    onClick={() => onPageChange(totalPages)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                >»</button>
            </div>
        </div>
    );
}
