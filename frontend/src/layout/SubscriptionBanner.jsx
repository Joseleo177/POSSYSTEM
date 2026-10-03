// src/layout/SubscriptionBanner.jsx
import React from "react";
import { diasParaVencer, estadoLicencia, fmtFecha } from "../components/Companies/license";

// Franja roja sobre la barra superior cuando la suscripción entra en "Por vencer" (7 días o
// menos, la misma regla que la pantalla de Empresas). Al vencer, el login y cada petición
// se bloquean (middleware/auth.js), así que esta es la única advertencia que ve la tienda.
//
// Se puede cerrar hasta el día siguiente, salvo el último día y el anterior: ahí queda fija.
// El superusuario no la ve: administra las licencias, no depende de una.
const dismissKey = (companyId) => `subscription-banner-hidden:${companyId}`;
const todayKey = () => new Date().toLocaleDateString("en-CA");

function readHidden(companyId) {
    try { return localStorage.getItem(dismissKey(companyId)) === todayKey(); } catch { return false; }
}

export default function SubscriptionBanner({ company, employee }) {
    const [hidden, setHidden] = React.useState(() => (company ? readHidden(company.id) : false));
    React.useEffect(() => { if (company) setHidden(readHidden(company.id)); }, [company?.id]);

    if (!company || employee?.is_superuser) return null;
    if (estadoLicencia(company) !== "por_vencer") return null;

    const dias = diasParaVencer(company.expires_at);
    const fija = dias <= 1;
    if (hidden && !fija) return null;

    const que = company.subscription_status === "Demo" ? "Tu periodo de prueba" : "Tu suscripción";
    const cuando = dias === 0 ? "vence hoy" : dias === 1 ? "vence mañana" : `vence en ${dias} días`;
    const accion = employee?.role === "admin"
        ? "Renuévala para que tu equipo no pierda el acceso."
        : "Avísale al administrador para que la renueve.";

    const hide = () => {
        try { localStorage.setItem(dismissKey(company.id), todayKey()); } catch {}
        setHidden(true);
    };

    return (
        <div role="alert" className="shrink-0 bg-red-600 text-white">
            <div className="flex items-center gap-2 px-3 sm:px-4 min-h-9 py-1.5">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="flex-1 min-w-0 text-[12px] sm:text-[13px] leading-snug">
                    <span className="font-semibold">{que} {cuando}</span>
                    <span className="hidden sm:inline">, el {fmtFecha(company.expires_at)}</span>
                    <span>. {accion}</span>
                </p>
                {!fija && (
                    <button
                        onClick={hide}
                        title="Ocultar hasta mañana"
                        aria-label="Ocultar hasta mañana"
                        className="w-7 h-7 -mr-1 rounded-md flex items-center justify-center shrink-0 text-white/80 hover:text-white hover:bg-white/15"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
