// src/hooks/useTabs.js
import { useEffect, useState } from "react";
import { ALL_TABS } from "../constants/tabs";

export function useTabs(employee, can, setReceipt) {
    const [tab, setTab] = useState("Dashboard");

    const canAny = (perms = []) => perms.some((p) => can(p));

    const visibleTabs = ALL_TABS.filter((t) => {
        if (t.superuserOnly) return !!employee?.is_superuser;
        if (t.adminOnly) return !!employee?.permissions?.all;
        return canAny(t.perms);
    });

    const activeTabVisible = visibleTabs.some((t) => t.key === tab);
    const safeTab = activeTabVisible ? tab : visibleTabs[0]?.key ?? "Dashboard";

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
