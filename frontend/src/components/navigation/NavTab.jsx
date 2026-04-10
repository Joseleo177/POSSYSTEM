import React from "react";
import { TAB_ICONS } from "../../constants/icons";

export default function NavTab({ t, active, onGo, collapsed }) {
    const isActive = active === t.key;
    return (
        <button
            onClick={() => onGo(t.key)}
            title={t.label}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200
      ${isActive
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                    : "text-content-subtle hover:bg-surface-3 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
        >
            <span className={`shrink-0 ${isActive ? "scale-110" : ""} transition-transform`}>
                {TAB_ICONS[t.key]()}
            </span>
            {!collapsed && <span className="tracking-tight truncate">{t.label}</span>}
        </button>
    );
}
