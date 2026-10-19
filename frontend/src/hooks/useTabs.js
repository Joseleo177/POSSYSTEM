// src/hooks/useTabs.js
import { useEffect, useState } from "react";
import { ALL_TABS } from "../constants/tabs";

// La última pantalla abierta, para volver a ella al recargar. Una caja que se reinicia tras un
// apagón tiene que caer en Venta y no en el Panel, que sin internet no tiene nada que mostrar.
const ULTIMA = "pos_ultima_pantalla";

export function useTabs(employee, can, setReceipt) {
    const [tab, setTabState] = useState(() => {
        try { return localStorage.getItem(ULTIMA) || "Dashboard"; } catch { return "Dashboard"; }
    });
    const setTab = (key) => {
        setTabState(key);
        try { localStorage.setItem(ULTIMA, key); } catch { /* modo privado */ }
    };

    const visibleTabs = ALL_TABS.filter((t) => {
        if (t.superuserOnly) return !!employee?.is_superuser;
        if (t.adminOnly)     return !!employee?.permissions?.all;
        if (t.perm === null) return !!employee;
        return can(t.perm);
    });

    const activeTabVisible = visibleTabs.some((t) => t.key === tab);
    // Sin ningún módulo visible el resultado es null, no "Dashboard": ahora que el tablero
    // pide permiso de reportes, caer en él por descarte metería al usuario en una página
    // que el backend le va a rechazar con 403.
    const safeTab = activeTabVisible ? tab : visibleTabs[0]?.key ?? null;

    useEffect(() => {
        if (!activeTabVisible && visibleTabs.length) {
            setTab(visibleTabs[0].key);
        }
    }, [activeTabVisible, visibleTabs]);

    const goTab = (key) => {
        setTab(key);
        if (key === "Cobro") setReceipt(null);
    };

    return { tab: safeTab, goTab, visibleTabs };
}
