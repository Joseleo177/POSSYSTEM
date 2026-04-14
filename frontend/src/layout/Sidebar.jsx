// src/Layout/Sidebar.jsx
import React from "react";
import NavTab from "../components/navigation/NavTab";
import { ROLE_COLORS, DEFAULT_ROLE_CLASS } from "../constants/roles";

export default function Sidebar({ settings, storeName, visibleTabs, safeTab, goTab, employee, dark, toggle, logout }) {
    const roleClass = ROLE_COLORS[employee?.role] || DEFAULT_ROLE_CLASS;

    return (
        <aside className="hidden md:flex flex-col w-56 bg-white dark:bg-surface-dark-2 border-r border-border dark:border-border-dark shrink-0">
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border dark:border-border-dark">
                {settings.logo_url ? (
                    <img src={settings.logo_url} alt="logo" className="h-8 w-auto object-contain" />
                ) : (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0 shadow-sm shadow-brand-500/20">
                        <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                        </svg>
                    </div>
                )}
                <span className="text-sm font-bold text-content dark:text-content-dark tracking-tight truncate">
                    {storeName}
                </span>
            </div>

            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-hide">
                {visibleTabs.map((t) => (
                    <NavTab key={t.key} t={t} active={safeTab} onGo={goTab} />
                ))}
            </nav>

            <div className="border-t border-border dark:border-border-dark p-3 space-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 text-xs font-black shrink-0">
                        {employee.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-content dark:text-content-dark truncate">
                            {employee.full_name}
                        </div>
                        <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${roleClass}`}>
                            {employee.role_label || employee.role}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggle}
                        className="btn-ghost p-2 rounded-lg flex-1"
                        title={dark ? "Modo claro" : "Modo oscuro"}
                    >
                        {dark ? (
                            <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                />
                            </svg>
                        )}
                    </button>
                    <button onClick={logout} className="btn-ghost p-2 rounded-lg flex-1 text-danger" title="Salir">
                        <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </aside>
    );
}
