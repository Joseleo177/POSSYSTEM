// src/components/PosApp.jsx
import React from "react";
import { useTheme } from "../hooks/useTheme";
import { useApp } from "../context/AppContext";
import { useCart } from "../context/CartContext";
import { useTabs } from "../hooks/useTabs";
import LoginScreen from "../components/LoginScreen";
import NotificationToast from "../layout/NotificationToast";
import HeaderMobile from "../layout/HeaderMobile";
import TopBar from "../layout/TopBar";
import AppLauncher from "../layout/AppLauncher";
import BottomTabs from "../layout/BottomTabs";
import MainContent from "../layout/MainContent";

export default function PosApp() {
    const { employee, authChecked, login, logout, can, notification, storeName, settings } = useApp();
    const { setReceipt } = useCart();
    const { dark, toggle } = useTheme();

    const { tab: safeTab, goTab, visibleTabs } = useTabs(employee, can, setReceipt);
    const [showLauncher, setShowLauncher] = React.useState(false);

    if (!authChecked)
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-2 dark:bg-surface-dark">
                <div className="flex items-center gap-3 text-content-muted dark:text-content-dark-muted">
                    <svg className="w-5 h-5 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                    </svg>
                    <span className="text-sm font-medium tracking-wide">Cargando...</span>
                </div>
            </div>
        );

    if (!employee) return <LoginScreen onLogin={login} />;

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-surface-2 dark:bg-surface-dark text-content dark:text-content-dark font-sans">
            <NotificationToast notification={notification} />

            <AppLauncher
                open={showLauncher}
                onClose={() => setShowLauncher(false)}
                visibleTabs={visibleTabs}
                safeTab={safeTab}
                goTab={goTab}
            />

            <HeaderMobile
                settings={settings}
                visibleTabs={visibleTabs}
                safeTab={safeTab}
                storeName={storeName}
                dark={dark}
                toggle={toggle}
                logout={logout}
            />

            <TopBar
                settings={settings}
                storeName={storeName}
                safeTab={safeTab}
                visibleTabs={visibleTabs}
                employee={employee}
                dark={dark}
                toggle={toggle}
                logout={logout}
                onOpenLauncher={() => setShowLauncher(true)}
            />

            <MainContent safeTab={safeTab} />

            <BottomTabs visibleTabs={visibleTabs} safeTab={safeTab} goTab={goTab} />
        </div>
    );
}
