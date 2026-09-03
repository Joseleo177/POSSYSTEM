import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { useTheme } from "../../../hooks/useTheme";

// Selección de sucursal, con la cara del tema boutique. Misma decisión que la versión
// estándar —la sucursal define qué stock y qué precio se ven, así que hay que elegirla antes
// de dejar entrar— pero sin estado propio que compartir: a diferencia de IdentityGate, aquí
// no hace falta un hook común.
export default function BranchGate({ store, warehouses, onChoose, currentId = null }) {
    const { dark, toggle } = useTheme();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-10 bg-surface-2 dark:bg-surface-dark">
            <button
                onClick={toggle}
                title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="fixed top-6 right-6 w-10 h-10 rounded-full bg-surface dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 shadow-sm flex items-center justify-center text-content-muted hover:text-brand-500 transition-colors z-50"
            >
                {dark ? (
                    <svg className="w-[18px] h-[18px] text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
            </button>

            <div className="w-full max-w-sm">
                <div className="text-center mb-6">
                    {store?.logo_url ? (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-40 h-40 sm:w-48 sm:h-48 object-contain mx-auto"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full mx-auto bg-brand-500/10 flex items-center justify-center text-4xl font-black text-brand-500">
                            {(store?.name || "C").charAt(0)}
                        </div>
                    )}
                    <h1 className="mt-3 text-[20px] font-bold text-brand-500 leading-tight">
                        {store?.name || "Catálogo"}
                    </h1>
                    {store?.slogan && (
                        <p className="text-[12px] font-medium text-content-muted mt-0.5">{store.slogan}</p>
                    )}
                </div>

                <div className="bg-surface dark:bg-surface-dark-2 rounded-3xl shadow-sm border border-border/40 dark:border-white/[0.06] p-6 space-y-4">
                    <div className="text-center space-y-1">
                        <h2 className="text-[15px] font-bold text-content dark:text-white">¿Dónde vas a comprar?</h2>
                        <p className="text-[11px] font-medium text-content-muted leading-relaxed">
                            {currentId
                                ? "Si cambias de tienda se vacía el carrito: el stock es distinto en cada una."
                                : "Elige tu tienda para ver lo que hay disponible allí."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        {warehouses.map(w => {
                            const actual = String(w.id) === String(currentId);
                            return (
                                <button
                                    key={w.id}
                                    onClick={() => onChoose(w.id)}
                                    className={`w-full h-16 px-4 rounded-full flex items-center gap-3 text-left border transition-all active:scale-[0.99] ${actual
                                        ? "bg-brand-500/10 border-brand-500/50"
                                        : "bg-surface-2 dark:bg-white/5 border-border dark:border-white/10 hover:border-brand-500/50"
                                        }`}
                                >
                                    <div className="w-9 h-9 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </div>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[14px] font-bold text-content dark:text-white truncate">
                                            {w.name}
                                        </span>
                                        {actual && (
                                            <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-500">
                                                Estás aquí
                                            </span>
                                        )}
                                    </span>
                                    <svg className="w-4 h-4 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {store?.phone && (
                    <p className="text-center text-[11px] font-medium text-content-muted mt-5">
                        ¿Problemas? Escríbenos al {store.phone}
                    </p>
                )}
            </div>
        </div>
    );
}
