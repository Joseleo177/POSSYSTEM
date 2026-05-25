// src/layout/TopBar.jsx
import React from "react";
import { resolveImageUrl } from "../helpers";
import { ROLE_COLORS, DEFAULT_ROLE_CLASS } from "../constants/roles";

function useDateTick() {
    const [now, setNow] = React.useState(new Date());
    React.useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);
    return now;
}

export default function TopBar({ settings, storeName, safeTab, visibleTabs, employee, dark, toggle, logout, onOpenLauncher, currencies = [] }) {
    const roleClass = ROLE_COLORS[employee?.role] || DEFAULT_ROLE_CLASS;
    const activeTab = visibleTabs.find((t) => t.key === safeTab);

    const now = useDateTick();
    const dateStr = now.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });

    const baseCurrency = currencies.find(c => c.is_base);
    const localCurrency = currencies.find(c => c.active && !c.is_base);
    const rateStr = localCurrency
        ? `${localCurrency.symbol || localCurrency.name}/${baseCurrency?.symbol || "Ref."}: ${parseFloat(localCurrency.exchange_rate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
        : null;

    return (
        <header className="hidden md:flex items-center gap-3 h-14 px-4 shrink-0 bg-white dark:bg-surface-dark-2 border-b border-border dark:border-border-dark">

            {/* App launcher button */}
            <button
                onClick={onOpenLauncher}
                title="Menú de aplicaciones"
                className="btn-ghost w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="5"  cy="5"  r="1.6" />
                    <circle cx="12" cy="5"  r="1.6" />
                    <circle cx="19" cy="5"  r="1.6" />
                    <circle cx="5"  cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                    <circle cx="5"  cy="19" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                    <circle cx="19" cy="19" r="1.6" />
                </svg>
            </button>

            {/* Logo + store name */}
            <div className="flex items-center gap-2 shrink-0">
                {settings?.logo_url ? (
                    <img src={resolveImageUrl(settings.logo_url)} alt="logo" className="h-8 w-auto object-contain" />
                ) : (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm shadow-brand-500/20 shrink-0">
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                )}
                <span className="text-sm font-black text-content dark:text-content-dark tracking-tight truncate max-w-[160px]">
                    {storeName}
                </span>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-border dark:bg-border-dark shrink-0 mx-1" />

            {/* Active module */}
            <span className="text-[11px] font-black text-brand-500 uppercase tracking-widest truncate">
                {activeTab?.label ?? ""}
            </span>

            {/* Center: date + exchange rate */}
            <div className="flex-1 flex justify-center items-center gap-0">
                {(dateStr || rateStr) && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/10 select-none">
                        <svg className="w-3 h-3 text-content-subtle opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[11px] font-bold text-content dark:text-white/70 tabular-nums">{dateStr}</span>
                        {rateStr && (
                            <>
                                <span className="text-[10px] text-content-subtle opacity-40 mx-0.5">|</span>
                                <svg className="w-3 h-3 text-brand-500 opacity-70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-[11px] font-bold text-brand-500 tabular-nums">{rateStr}</span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Employee info */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 text-xs font-black shrink-0">
                    {employee?.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex flex-col items-start leading-none">
                    <span className="text-xs font-semibold text-content dark:text-content-dark truncate max-w-[100px]">
                        {employee?.full_name}
                    </span>
                    <span className={`text-[10px] font-semibold px-1 py-px rounded border mt-0.5 ${roleClass}`}>
                        {employee?.role_label || employee?.role}
                    </span>
                </div>
            </div>

            {/* Dark mode toggle */}
            <button
                onClick={toggle}
                className="btn-ghost w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                title={dark ? "Modo claro" : "Modo oscuro"}
            >
                {dark ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                )}
            </button>

            {/* Logout */}
            <button
                onClick={logout}
                className="btn-ghost w-9 h-9 rounded-lg flex items-center justify-center text-danger shrink-0"
                title="Salir"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </button>
        </header>
    );
}
