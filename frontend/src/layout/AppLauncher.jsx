// src/layout/AppLauncher.jsx
import React, { useEffect } from "react";
import { TAB_ICONS } from "../constants/icons";

export default function AppLauncher({ open, onClose, visibleTabs, safeTab, goTab }) {

    useEffect(() => {
        if (!open) return;
        const handleKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    if (!open) return null;

    const handleTileClick = (key) => {
        goTab(key);
        onClose();
    };

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[900] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-2xl mx-4 p-8 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark shadow-2xl animate-in zoom-in-95 fade-in duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-content dark:text-content-dark">
                        Aplicaciones
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-content-subtle hover:text-danger hover:bg-danger/10 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {visibleTabs.map((t) => {
                        const isActive = safeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                onClick={() => handleTileClick(t.key)}
                                className={`group flex flex-col items-center justify-center gap-2.5 p-5 rounded-2xl bg-gradient-to-br ${t.color} transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 ${isActive ? "ring-2 ring-white/60 ring-offset-2 ring-offset-transparent" : ""}`}
                            >
                                <span className="text-white drop-shadow-sm">
                                    {TAB_ICONS[t.key]("w-8 h-8")}
                                </span>
                                <span className="text-white text-[11px] font-bold text-center leading-tight drop-shadow-sm">
                                    {t.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
