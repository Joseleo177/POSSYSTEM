// Monto ya formateado ("Ref. 5.34", "$ 12.00", "Bs. 1234.56", "-Ref. 3.00") con el prefijo
// de moneda atenuado y la cifra con dígitos tabulares. En una columna de totales lo que se
// compara son las cifras; el "Ref." repetido cincuenta veces con el mismo peso competía con
// ellas. Un signo delante del prefijo pasa a la cifra: "-Ref. 3.00" se lee "Ref. -3.00".
// Si el texto no empieza con un prefijo no numérico se muestra entero, sin partir.
//
// La cifra va tal como la entrega fmtMoney, sin separador de miles. Se probó agruparla con
// coma ("51,473.30") y en Venezuela eso se lee al revés: la coma es el decimal. Tampoco se
// pasa al formato local ("51.473,30") solo aquí, porque el resto de la app (POS, cobros,
// tickets) muestra "51473.30" y convivirían dos convenciones en la misma pantalla.
export default function Money({ value, className = "", strike = false }) {
    const s = String(value ?? "");
    const m = s.match(/^([+\-−]?)\s*([^\d+\-−]+?)\s*([+\-−]?\d.*)$/);
    const cls = `tabular-nums whitespace-nowrap ${strike ? "line-through decoration-1" : ""} ${className}`;
    if (!m) return <span className={cls}>{s}</span>;
    return (
        <span className={cls}>
            <span className="text-[0.78em] font-medium text-content-subtle mr-1">{m[2].trim()}</span>
            {m[1]}{m[3]}
        </span>
    );
}
