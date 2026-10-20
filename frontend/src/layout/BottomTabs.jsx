// src/Layout/BottomTabs.jsx
import React, { useEffect, useRef } from "react";
import MobileTab from "../components/navigation/MobileTab";

export default function BottomTabs({ visibleTabs, safeTab, goTab }) {
    const barRef = useRef(null);

    // Con más pestañas de las que caben, la activa podía quedar fuera de la barra (se entraba
    // desde el lanzador o la paleta y no se veía dónde estabas). Se trae a la vista al cambiar.
    useEffect(() => {
        const activa = barRef.current?.querySelector('[aria-current="page"]');
        activa?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }, [safeTab]);

    return (
        <nav className="md:hidden bg-white dark:bg-surface-dark-2 border-t border-border dark:border-border-dark shadow-[0_-4px_20px_rgba(0,0,0,0.08)] shrink-0">
            {/* La fila interna es w-max/min-w-full: con justify-around directo en el contenedor
                que desplaza, al desbordar las primeras pestañas quedaban cortadas a la izquierda
                sin poder alcanzarlas. */}
            <div ref={barRef} className="overflow-x-auto scrollbar-hide overscroll-x-contain">
                <div className="flex items-center justify-around w-max min-w-full px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                    {visibleTabs.map((t) => (
                        <MobileTab key={t.key} t={t} active={safeTab} onGo={goTab} />
                    ))}
                </div>
            </div>
        </nav>
    );
}
