import { useState, useRef, useCallback } from "react";

// Envuelve una acción async (guardar, crear, enviar) con un candado: mientras corre, `busy`
// es true para pintar el spinner, y un segundo clic no la vuelve a disparar. Es lo mismo que
// hace ui/Button por su cuenta; esto es para los botones hechos a mano que no lo usan.
export function useAsyncAction(fn) {
    const [busy, setBusy] = useState(false);
    const runningRef = useRef(false);

    const run = useCallback(async (...args) => {
        if (runningRef.current || !fn) return;
        runningRef.current = true;
        setBusy(true);
        try {
            return await fn(...args);
        } finally {
            runningRef.current = false;
            setBusy(false);
        }
    }, [fn]);

    return [run, busy];
}
