import { useEffect, useState } from "react";
import { api } from "../services/api";
import { todayISO } from "../helpers";

// Respuestas por fecha, unos minutos: abrir y cerrar el cobro o ir y volver entre dos fechas no
// debe salir a preguntar cada vez. Un día pasado casi nunca cambia; si alguien lo corrige en el
// historial, a los 3 minutos ya se lee lo nuevo.
const TTL = 3 * 60 * 1000;
const cache = new Map();   // fecha -> { at, data }

/**
 * Tasa de cada moneda el día `date` ('YYYY-MM-DD'), para cobrar un pago de fecha anterior a la
 * tasa de ese día (decisión del usuario, 04-11-2026: abonos que el cobrador registra tarde).
 *
 * Hoy, o una fecha que no es pasada, no consulta nada: manda la tasa cargada, la de siempre.
 * Devuelve `rateOf(currencyId)`, que es null cuando no aplica o no hay dato (el que llama sigue
 * con la de hoy), y `status`: "hoy" | "cargando" | "listo" | "sin_dato" | "error".
 */
export function useRatesOn(date) {
    const past = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && date < todayISO();
    const [state, setState] = useState({ date: null, data: null, error: false });

    useEffect(() => {
        if (!past) return;
        const hit = cache.get(date);
        if (hit && Date.now() - hit.at < TTL) { setState({ date, data: hit.data, error: false }); return; }
        let vivo = true;
        setState({ date, data: null, error: false });
        api.currencies.ratesOn(date)
            .then(r => {
                cache.set(date, { at: Date.now(), data: r.data });
                if (vivo) setState({ date, data: r.data, error: false });
            })
            .catch(() => { if (vivo) setState({ date, data: null, error: true }); });
        return () => { vivo = false; };
    }, [date, past]);

    if (!past) return { status: "hoy", rateOf: () => null, infoOf: () => null };
    const vigente = state.date === date;
    if (!vigente || (!state.data && !state.error)) return { status: "cargando", rateOf: () => null, infoOf: () => null };
    if (state.error) return { status: "error", rateOf: () => null, infoOf: () => null };

    const byId = new Map((state.data.rates || []).map(r => [String(r.currency_id), r]));
    const infoOf = (id) => byId.get(String(id)) || null;
    const rateOf = (id) => { const r = infoOf(id)?.rate; return r > 0 ? r : null; };
    const algunaSinDato = (state.data.rates || []).some(r => !(r.rate > 0));
    return { status: algunaSinDato ? "sin_dato" : "listo", rateOf, infoOf };
}
