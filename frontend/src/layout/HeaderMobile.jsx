// src/Layout/HeaderMobile.jsx
import React from "react";

export default function HeaderMobile({ settings, visibleTabs, safeTab, storeName, dark, toggle, logout }) {
    const activeTab = visibleTabs.find((t) => t.key === safeTab);

    return (
        <header className="md:hidden sticky top-0 z-50 bg-white dark:bg-surface-dark-2 border-b border-border dark:border-border-dark shadow-card">
            <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex items-center gap-2 shrink-0">
                    {settings.logo_url ? (
                        <img src={settings.logo_url} alt="logo" className="h-7 w-auto object-contain" />
                    ) : (
                        <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.75}
                                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                />
                            </svg>
                        </div>
                    )}
                    <span className="text-sm font-black text-content dark:text-content-dark tracking-tight">
                        {activeTab?.mobileLabel || storeName}
                    </span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={toggle}
                        className="btn-ghost p-1.5 rounded-lg"
                        title={dark ? "Modo claro" : "Modo oscuro"}
                    >
                        {dark ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                />
                            </svg>
                        )}
                    </button>
                    <button onClick={logout} className="btn-ghost p-1.5 rounded-lg" title="Salir">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}
