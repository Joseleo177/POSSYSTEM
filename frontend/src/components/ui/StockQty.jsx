// Existencia de un producto: Inventario, Catálogo y POS.
//
// Antes cada cantidad llevaba su semáforo completo: verde lo normal, ámbar lo bajo y rojo lo
// agotado. Con la mayoría de las filas en verde o ámbar, el color dejaba de avisar y la
// pantalla entera se veía amarilla. Aquí el número va en tinta y solo lo que pide atención
// se marca: un punto ámbar si está bajo y el número en rojo si se agotó.
//
// "Bajo" usa el mínimo del producto cuando lo tiene; si no, el umbral que pase la pantalla.
import { fmtQtyUnit } from "../../helpers/unitFormatter";

export function stockLevel(qty, min, fallback = 5) {
    const n = parseFloat(qty) || 0;
    if (n <= 0) return "out";
    const lim = parseFloat(min) > 0 ? parseFloat(min) : fallback;
    return n <= lim ? "low" : "ok";
}

// "12 UNIDADES" → ["12", "UNIDADES"]. Pasa por fmtQtyUnit para heredar sus reglas: plural,
// 3 decimales en peso y volumen, y truncar (no redondear) las unidades contables.
export function splitQty(qty, unit) {
    const s = fmtQtyUnit(qty, unit || "uds");
    const i = s.indexOf(" ");
    let [n, u] = i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
    // En peso, fmtQtyUnit fija 3 decimales y "2,000 KG" se leía como dos mil: se quitan los
    // ceros de la derecha ("2 KG", "9,7 KG").
    if (/,\d+$/.test(n)) n = n.replace(/0+$/, "").replace(/,$/, "");
    return [n, u];
}

const TITLE = { out: "Agotado", low: "Stock bajo" };

export default function StockQty({ qty, value, unit, min, fallback, size = "text-[13px]" }) {
    const level = stockLevel(qty, min, fallback);
    return (
        <span className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap" title={TITLE[level]}>
            {level !== "ok" && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${level === "out" ? "bg-red-500" : "bg-amber-500"}`} />
            )}
            <span className={`${size} font-semibold ${level === "out" ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                {value}
            </span>
            {unit && <span className="text-[10px] font-medium uppercase tracking-wide text-content-subtle">{unit}</span>}
        </span>
    );
}

// Franja de cantidad sobre la foto en las vistas de tarjetas: fondo oscuro translúcido para
// todo, rojo solo si se agotó. El punto ámbar marca lo bajo sin pintar la franja entera.
export function StockBand({ qty, value, unit, min, fallback, className = "", unitClass = "text-[10px]" }) {
    const level = stockLevel(qty, min, fallback);
    return (
        <div className={`flex items-baseline gap-1 text-white tabular-nums ${level === "out" ? "bg-red-600/90" : "bg-black/60"} ${className}`} title={TITLE[level]}>
            {level === "low" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 self-center shrink-0" />}
            <span className="font-bold leading-none">{value}</span>
            {unit && <span className={`${unitClass} font-semibold uppercase opacity-75 truncate`}>{unit}</span>}
        </div>
    );
}
