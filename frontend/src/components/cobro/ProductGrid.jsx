import { useRef } from "react";
import CustomSelect from "../ui/CustomSelect";
import KeyboardLegend from "./KeyboardLegend";

export default function ProductGrid({
    mobileTab, setMobileTab, cart,
    search, setSearch, onSearchKeyDown,
    searchInputRef,
    selectedCat, setSelectedCat, categories,
    filteredProducts, selectedIndex,
    addToCart, convertToDisplay, currSym, fmt,
}) {
    return (
        <main className={`flex-1 flex-col p-4 overflow-hidden order-1 lg:order-2 ${mobileTab === "products" ? "flex" : "hidden"} lg:flex`}>

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

            {/* Grilla */}
            <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-hide">
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                    {filteredProducts.map((p, idx) => {
                        const outOfStock = !p.is_service && (p.stock ?? 0) <= 0;
                        const isSelected = idx === selectedIndex;
                        return (
                            <div
                                key={p.id}
                                onClick={() => !outOfStock && addToCart(p)}
                                className={`group bg-white dark:bg-surface-dark-2 rounded-xl overflow-hidden transition-all shadow border-2
                                    ${isSelected ? "border-brand-500 shadow-lg shadow-brand-500/20 scale-105 z-10" : "border-transparent"}
                                    ${outOfStock ? "opacity-40 cursor-not-allowed" : "hover:-translate-y-0.5 cursor-pointer hover:border-brand-500/50"}`}
                            >
                                <div className="aspect-[4/3] bg-surface-1 dark:bg-white/5 relative overflow-hidden">
                                    {p.image_url
                                        ? <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                                        : <div className="w-full h-full flex items-center justify-center opacity-10 dark:text-white"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                    }
                                    {outOfStock && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="bg-black/60 text-white text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full">Sin stock</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 flex flex-col gap-1">
                                    <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide truncate">{p.category_name || "Sin Categoría"}</div>
                                    <div className="text-xs font-black line-clamp-2 dark:text-white uppercase tracking-wide leading-tight">{p.name}</div>
                                    <div className="text-sm font-black dark:text-white font-display">{fmt(convertToDisplay(p.price), currSym)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <KeyboardLegend />
        </main>
    );
}
