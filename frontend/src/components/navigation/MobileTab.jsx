// src/components/navigation/MobileTab.jsx
import React from "react";
import { TAB_ICONS } from "../../constants/icons";

export default function MobileTab({ t, active, onGo }) {
    const isActive = active === t.key;
    return (
        <button
            onClick={() => onGo(t.key)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1.5 px-1 rounded-xl transition-all
      ${isActive
                    ? "text-brand-500"
                    : "text-content-subtle/60 dark:text-content-dark-muted/60"
                }`}
        >
            <span className={`transition-transform ${isActive ? "scale-110" : ""}`}>
                {TAB_ICONS[t.key]()}
            </span>
            <span
                className={`text-[11px] font-bold leading-none truncate max-w-[60px] ${isActive ? "font-black" : ""
                    }`}
            >
                {t.mobileLabel}
            </span>
            {isActive && <span className="w-1 h-1 rounded-full bg-brand-500 mt-0.5" />}
        </button>
    );
}
