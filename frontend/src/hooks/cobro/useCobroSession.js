import { useState, useEffect } from "react";
import { api } from "../../services/api";

export function useCobroSession(employee, activeWarehouse) {
    const [cashSession, setCashSession] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true);
    const [showApertura, setShowApertura] = useState(false);
    const [showCierre, setShowCierre] = useState(false);

    useEffect(() => {
        if (!employee?.id || !activeWarehouse?.id) return;
        setCheckingSession(true);
        api.cashSessions.current({ employee_id: employee.id, warehouse_id: activeWarehouse.id })
            .then(r => {
                if (r.data) { setCashSession(r.data); setShowApertura(false); }
                else         { setCashSession(null);   setShowApertura(true); }
            })
            .catch(() => { setCashSession(null); setShowApertura(true); })
            .finally(() => setCheckingSession(false));
    }, [employee?.id, activeWarehouse?.id]);

    return {
        cashSession, setCashSession,
        checkingSession,
        showApertura, setShowApertura,
        showCierre, setShowCierre,
    };
}
