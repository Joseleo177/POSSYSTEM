import { useRef, useEffect } from "react";
import CustomSelect from "../ui/CustomSelect";
import KeyboardLegend from "./KeyboardLegend";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { resolveImageUrl } from "../../helpers";

export default function ProductGrid({
    mobileTab, setMobileTab, cart,
    search, setSearch, onSearchKeyDown,
    searchInputRef,
    selectedCat, setSelectedCat, categories,
    filteredProducts, selectedIndex,
    openQtyModal, convertToDisplay, convertToSecondary, currSym, secondaryCurrency, fmt,
    loadMore, loadingMore, hasMore,
    notify,
}) {
    const sentinelRef = useRef(null);

    const handleSelect = (p) => {
        // Bloquear si stock es 0 o menos, salvo: servicio, o combo con stock null (todos sus ingredientes son servicios)
        if (!p.is_service && !(p.is_combo && p.stock === null) && parseFloat(p.stock) <= 0) {
            return notify("Producto sin existencias", "error");
        }
        openQtyModal(p);
    };

    // IntersectionObserver — dispara loadMore cuando el sentinel entra en pantalla
    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore(); },
            { threshold: 0.1 }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loadMore]);

    return (
        <main className={`flex-1 flex-col p-2 lg:p-4 overflow-hidden order-1 lg:order-2 ${mobileTab === "products" ? "flex" : "hidden"} lg:flex`}>

            {/* Mobile toggle */}
            <div className="lg:hidden flex items-center gap-2 mb-3">
                <button onClick={() => setMobileTab("products")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${mobileTab === "products" ? "bg-brand-500 text-white" : "bg-white dark:bg-white/5 text-content-subtle"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    Catálogo
                </button>
                <button onClick={() => setMobileTab("cart")} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all relative ${mobileTab === "cart" ? "bg-brand-500 text-white" : "bg-white dark:bg-white/5 text-content-subtle"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                    Carrito
                    {cart.length > 0 && <span className="w-4 h-4 bg-danger text-white text-[11px] font-black rounded-full flex items-center justify-center">{cart.length}</span>}
                </button>
            </div>

            {/* Barra búsqueda + filtro */}
            <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle opacity-40 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input
                        ref={searchInputRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                        placeholder="Buscar producto... (F1)"
                        className="input !pl-10 w-full"
                    />
                </div>
                <div className="relative shrink-0">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 z-10">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                    </div>
                    <CustomSelect
                        value={selectedCat}
                        onChange={setSelectedCat}
                        options={[{ value: "all", label: "Todas las categorías" }, ...categories.map(c => ({ value: c.name, label: c.name }))]}
                        className="!pl-9 min-w-[140px] !text-[11px] font-black uppercase tracking-wide h-10"
                    />
                </div>
            </div>


            {/* Grilla de productos - Fixed height with scroll */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
                {filteredProducts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 gap-3 py-10">
                        <div className="w-16 h-16 rounded-[32px] bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle opacity-20">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <div className="text-[11px] font-black tracking-widest uppercase text-center dark:text-white">No se encontraron productos</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-1.5 lg:gap-4 pb-10">
                        {filteredProducts.map((p, idx) => (
                            <div
                                key={p.id}
                                onClick={() => handleSelect(p)}
                                className={`group bg-white dark:bg-white/5 rounded-2xl lg:rounded-[32px] overflow-hidden border transition-all cursor-pointer active:scale-95
                                    ${idx === selectedIndex ? "border-brand-500 ring-2 lg:ring-4 ring-brand-500/10 shadow-2xl -translate-y-0.5 lg:-translate-y-1 scale-[1.02]" : "border-black/5 dark:border-white/5 hover:border-brand-500/50"}`}
                             >
                                <div className="aspect-[4/3] lg:aspect-square relative overflow-hidden bg-surface-2 dark:bg-black/20">
                                    {p.image_url ? (
                                        <img src={resolveImageUrl(p.image_url)} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center opacity-10 dark:text-white">
                                            <svg className="w-6 h-6 lg:w-10 lg:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                    )}
                                    {p.stock <= 5 && !p.is_service && (
                                        <div className={`absolute top-1 lg:top-2 right-1 lg:right-2 text-white text-[6px] lg:text-[10px] font-black px-1 lg:px-1.5 py-0.5 rounded-full shadow-lg uppercase tracking-tighter ${p.stock <= 0 ? "bg-danger" : "bg-orange-500"}`}>
                                            {fmtQtyUnit(p.stock, p.unit)}
                                        </div>
                                    )}
                                </div>
                                <div className="p-1 lg:p-3 flex flex-col gap-0.5 lg:gap-1">
                                    <div className="text-[7px] lg:text-[11px] font-black text-brand-500 uppercase tracking-tighter lg:tracking-wide truncate">{p.category_name || "Sin Categoría"}</div>
                                    <div className="text-[8px] lg:text-xs font-black line-clamp-2 dark:text-white uppercase tracking-tight lg:tracking-wide leading-none h-4 lg:h-8">{p.name}</div>
                                    <div className="mt-0.5">
                                        <div className="text-[9px] lg:text-sm font-black dark:text-white font-display leading-none">{fmt(convertToDisplay(p.price), currSym)}</div>
                                        {secondaryCurrency && (
                                            <div className="text-[6px] lg:text-[10px] font-bold text-content-subtle dark:text-content-dark-muted opacity-60 tabular-nums">
                                                {fmt(convertToSecondary(p.price), secondaryCurrency.symbol)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={sentinelRef} className="h-4 w-full" />
                    </div>
                )}
            </div>

            <KeyboardLegend />
        </main>
    );
}
