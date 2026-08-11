import { useState, useEffect, useRef } from "react";

// Input numérico que preserva lo que el usuario escribe (permite ".", "" y borrar)
// Solo sincroniza desde fuera cuando el valor externo cambia significativamente.
// integer=true: descarta el separador decimal en el momento de tipear (no solo al confirmar),
// para que nunca llegue a mostrarse en pantalla (p.ej. cantidades de productos por UNIDAD).
//
// Vive en ui/ porque lo comparten la tabla del detalle y la de la orden nueva: las dos
// cargan costos en la moneda de la factura, y con dos copias del componente la de la orden
// nueva se quedaba sin el arreglo de sincronización.
export default function EditablePriceInput({ value, onChange, disabled, className, decimals = 5, integer = false }) {
    const toDisplay = (v) => (parseFloat(v) > 0 ? String(+parseFloat(v).toFixed(decimals)) : "");
    const [display, setDisplay] = useState(() => toDisplay(value));
    const extRef = useRef(value);

    useEffect(() => {
        const ext = parseFloat(value) || 0;
        const cur = parseFloat(extRef.current) || 0;
        if (Math.abs(ext - cur) > 0.00001) {
            extRef.current = value;
            setDisplay(toDisplay(value));
        }
    }, [value]);

    const handleChange = (e) => {
        const raw = integer ? e.target.value.replace(/[.,]/g, "") : e.target.value;
        setDisplay(raw);
        extRef.current = raw;
        onChange(raw);
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            value={display}
            disabled={disabled}
            onChange={handleChange}
            className={className}
        />
    );
}
