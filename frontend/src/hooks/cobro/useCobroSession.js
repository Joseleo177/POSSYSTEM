import { useState, useEffect } from "react";
import { api } from "../../services/api";

export function useCobroSession(employee, activeWarehouse) {
    const [cashSession, setCashSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showApertura, setShowApertura] = useState(false);
    const [showCierre, setShowCierre] = useState(false);

    useEffect(() => {
        if (!employee?.id || !activeWarehouse?.id) return;

        // Al montar (o al cambiar de sucursal) puede haber una consulta anterior en vuelo: la
        // de la sucursal recién resuelta la pisa. Sin este guardo, una respuesta que llega
        // tarde abría o cerraba el cuadro de "Iniciar caja" según una sucursal que ya no es la
        // activa — de ahí el parpadeo (aparece y desaparece). StrictMode lo hace en cada carga.
        let cancelled = false;
        setCheckingSession(true);

        api.cashSessions.current({ employee_id: employee.id, warehouse_id: activeWarehouse.id })
            .then(r => {
                if (cancelled) return;
                if (r.data) { setCashSession(r.data); setShowApertura(false); }
                else        { setCashSession(null);   setShowApertura(true); }
            })
            .catch(() => {
                // Un fallo de red no prueba que no haya caja abierta: no forzar el modal, solo
                // dejar de bloquear la pantalla.
                if (!cancelled) setCashSession(null);
            })
            .finally(() => { if (!cancelled) setCheckingSession(false); });

        return () => { cancelled = true; };
    }, [employee?.id, activeWarehouse?.id]);

    return {
        cashSession, setCashSession,
        checkingSession,
        showApertura, setShowApertura,
        showCierre, setShowCierre,
    };
}
