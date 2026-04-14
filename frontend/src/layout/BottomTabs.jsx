// src/Layout/BottomTabs.jsx
import React from "react";
import MobileTab from "../components/navigation/MobileTab";

export default function BottomTabs({ visibleTabs, safeTab, goTab }) {
    return (
        <nav className="md:hidden bg-white dark:bg-surface-dark-2 border-t border-border dark:border-border-dark shadow-[0_-4px_20px_rgba(0,0,0,0.08)] shrink-0">
            <div className="flex items-center justify-around overflow-x-auto scrollbar-hide px-1 py-1 safe-area-bottom">
                {visibleTabs.map((t) => (
                    <MobileTab key={t.key} t={t} active={safeTab} onGo={goTab} />
                ))}
            </div>
        </nav>
    );
}
