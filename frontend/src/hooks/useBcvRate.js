import { useSyncExternalStore } from "react";
import { api } from "../services/api";

// Tasa publicada por el BCV ({ rate, value_date, source }), compartida entre el aviso
// (layout/RateBanner) y el botón de la barra superior. `manual` marca que la pidió el usuario
// con ese botón: entonces el aviso se muestra aunque antes lo haya descartado.
let state = { data: null, manual: false, checking: false, at: 0 };
const listeners = new Set();
const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach(l => l());
};
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export async function checkBcvRate({ manual = false } = {}) {
    if (state.checking) return state.data;
    set({ checking: true });
    try {
        const r = await api.currencies.bcv(manual);
        set({ data: r.data, manual, at: Date.now() });
        return r.data;
    } finally {
        set({ checking: false });
    }
}

export const clearBcvManual = () => set({ manual: false });
export const getBcvState = () => state;

export function useBcvRate() {
    return useSyncExternalStore(subscribe, () => state);
}
