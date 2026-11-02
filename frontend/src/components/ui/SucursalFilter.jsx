// src/components/ui/SucursalFilter.jsx
import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import CustomSelect from "./CustomSelect";

// Filtro de sucursal de una pantalla, entre las MARCADAS en la barra de arriba (SucursalSwitcher).
// Con una sola marcada no hay nada que elegir y no se dibuja: el servidor ya responde recortado
// a ella. Con varias, deja mirar una sola o todas juntas.
//
// `todas`: ofrecer "Todas (N)". Las pantallas que muestran UNA sucursal (catálogo, kardex,
// mesas) lo apagan y arrancan en la actual.
// `soloVenden`: deja fuera los depósitos (no venden ni cobran: no aportan a ventas ni a cajas).
//
// El estado no se resetea a mano: al cambiar las marcadas, la pantalla se monta de nuevo.
export function useSucursalFilter({ todas = true, soloVenden = false } = {}) {
    const { sucursalesMarcadas, sucursalActual, etiquetaSucursales } = useApp();
    const lista = soloVenden ? sucursalesMarcadas.filter(w => w.sells !== false) : sucursalesMarcadas;
    const inicial = todas ? ""
        : String((lista.find(w => w.id === sucursalActual?.id) || lista[0])?.id ?? "");
    const [warehouseId, setWarehouseId] = useState(inicial);

    const elegida = lista.find(w => String(w.id) === String(warehouseId));
    const options = [
        ...(todas ? [{ value: "", label: `Todas (${lista.length})` }] : []),
        ...lista.map(w => ({ value: String(w.id), label: toNameCase(w.name) })),
    ];
    return {
        warehouseId, setWarehouseId, options,
        visible: lista.length > 1,
        // Para títulos de PDF y Excel: la elegida, o las marcadas ("" = todas las del usuario).
        nombre: elegida ? elegida.name : etiquetaSucursales,
        // Para acotar listas que dependen de la sucursal (series, empleados).
        ids: elegida ? [elegida.id] : lista.map(w => w.id),
    };
}

export default function SucursalFilter({ filter, height, className = "", boxClassName = "h-10 min-w-[180px]" }) {
    if (!filter.visible) return null;
    return (
        <CustomSelect
            value={filter.warehouseId}
            onChange={filter.setWarehouseId}
            options={filter.options}
            placeholder={filter.options[0]?.label}
            height={height}
            className={className}
            boxClassName={boxClassName}
        />
    );
}
