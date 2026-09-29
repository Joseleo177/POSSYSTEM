import React from "react";
import { TAB_ICONS } from "../../constants/icons";

export default function NavTab({ t, active, onGo, collapsed }) {
    const isActive = active === t.key;
    return (
        <button
            onClick={() => onGo(t.key)}
            title={t.label}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors duration-150
 ${isActive
                    ? "bg-surface-3 text-content font-semibold dark:bg-white/[0.07] dark:text-white"
                    : "text-content-subtle hover:bg-surface-3 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
        >
            <span className={`shrink-0 ${isActive ? "text-brand-600 dark:text-brand-400" : ""}`}>
                {TAB_ICONS[t.key]()}
            </span>
            {!collapsed && <span className="tracking-tight truncate">{t.label}</span>}
        </button>
    );
}
