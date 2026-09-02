import { useMemo, useRef } from "react";
import { resolveImageUrl, buildBarcode, barcodeBars } from "../../helpers";
import { zoneRows, LABEL_ELEMENTS } from "./labelTemplate";

const mm = (v) => `${v}mm`;

// Una etiqueta impresa. Todo se mide en milímetros —no en px ni en clases de Tailwind— para que
// lo que se ve en pantalla sea exactamente lo que sale del rollo, y para que la misma plantilla
// se adapte sola cuando cambia el tamaño de la etiqueta.
export default function PriceLabel({
    product,
    template,
    layoutMode = "zones",
    width,
    height,
    border = false,
    currency,
    altCurrency,
    convert,
    companyInfo,
    categoryName,
    // Solo para el lienzo de edición: permite arrastrar los elementos y marca el seleccionado.
    editable = false,
    selectedId = null,
    onSelect,
    onDrag,
}) {
    const areaRef = useRef(null);
    const pad = Math.max(1.5, height * 0.08);
    const innerW = width - pad * 2;

    // Tamaño de referencia del texto corriente: limitado por el alto (que no se apilen más de
    // ~7 líneas) y por el ancho (que no se desborde en etiquetas angostas).
    const base = Math.max(1.4, Math.min(height * 0.11, width * 0.075));

    // El entero del precio manda sobre el resto: se calcula por dígitos y se topa por el alto.
    const priceSize = (intPart) => {
        const digits = Math.max(1, intPart.length);
        const byWidth = innerW / (digits * 0.62 + 1.1); // reserva sitio para símbolo y decimales
        const byHeight = height * 0.5;
        return Math.max(3, Math.min(byWidth, byHeight));
    };

    const main = convert(product.price, currency);
    const alt = altCurrency ? convert(product.price, altCurrency) : null;

    const barcode = useMemo(() => buildBarcode(product.barcode), [product.barcode]);
    const bars = useMemo(() => (barcode ? barcodeBars(barcode.bits) : []), [barcode]);

    const textStyle = (scale, weight = 900) => ({
        fontSize: mm(base * scale),
        lineHeight: 1.15,
        fontWeight: weight,
    });

    const renderElement = (el) => {
        switch (el.id) {
            case "logo":
                if (!companyInfo?.logo_url) return null;
                return (
                    <img
                        src={resolveImageUrl(companyInfo.logo_url)}
                        alt=""
                        style={{ height: mm(base * 2 * el.scale), maxWidth: mm(innerW * 0.5), objectFit: "contain" }}
                    />
                );

            case "store":
                return <div className="uppercase" style={textStyle(el.scale)}>{companyInfo?.name || ""}</div>;

            case "name":
                return (
                    <div className="uppercase tracking-tight line-clamp-2 break-words" style={textStyle(el.scale * 1.05)}>
                        {product.name}
                    </div>
                );

            case "category":
                return <div className="uppercase truncate" style={textStyle(el.scale, 700)}>{categoryName || ""}</div>;

            case "unit":
                return <div className="uppercase truncate" style={textStyle(el.scale, 700)}>{product.unit || ""}</div>;

            case "price": {
                const size = priceSize(main.int) * el.scale;
                return (
                    <div className="flex items-end" style={{ lineHeight: 1 }}>
                        <span className="font-black" style={{ fontSize: mm(size * 0.42) }}>{currency?.symbol}</span>
                        <span className="font-black tracking-tighter" style={{ fontSize: mm(size), lineHeight: 0.8 }}>{main.int}</span>
                        <span className="font-black" style={{ fontSize: mm(size * 0.45), lineHeight: 1 }}>,{main.dec}</span>
                    </div>
                );
            }

            case "price_alt": {
                if (!alt) return null;
                const size = priceSize(alt.int) * el.scale * 0.45;
                return (
                    <div className="flex items-end" style={{ lineHeight: 1 }}>
                        <span className="font-black" style={{ fontSize: mm(size * 0.55) }}>{altCurrency?.symbol}</span>
                        <span className="font-black tracking-tight" style={{ fontSize: mm(size), lineHeight: 0.9 }}>{alt.int}</span>
                        <span className="font-black" style={{ fontSize: mm(size * 0.6), lineHeight: 1 }}>,{alt.dec}</span>
                    </div>
                );
            }

            case "barcode": {
                if (!barcode) return null;
                const totalModules = barcode.bits.length;
                const h = Math.max(3, height * 0.2 * el.scale);
                return (
                    <svg
                        viewBox={`0 0 ${totalModules} 100`}
                        preserveAspectRatio="none"
                        style={{ width: mm(innerW), height: mm(h), display: "block" }}
                    >
                        {bars.map((b, i) => (
                            <rect key={i} x={b.x} y="0" width={b.width} height="100" fill="#000" />
                        ))}
                    </svg>
                );
            }

            case "code":
                return (
                    <div className="tracking-[0.15em] truncate" style={textStyle(el.scale, 700)}>
                        {barcode?.text || product.barcode || ""}
                    </div>
                );

            case "date":
                return (
                    <div style={textStyle(el.scale, 700)}>
                        {new Date().toLocaleDateString("es-VE")}
                    </div>
                );

            default:
                return null;
        }
    };

    const alignClass = { left: "items-start text-left", center: "items-center text-center", right: "items-end text-right" };

    const renderZone = (zone, extraClass) => {
        const rows = zoneRows(template, zone);
        return (
            <div className={`flex flex-col w-full ${extraClass}`} style={{ gap: mm(Math.max(0.3, height * 0.015)) }}>
                {rows.map((row, i) => (
                    <div
                        key={i}
                        className={`flex w-full ${row.length > 1 ? "justify-between items-center" : ""}`}
                        style={{ gap: mm(1) }}
                    >
                        {row.map(el => (
                            <div key={el.id} className={`flex flex-col min-w-0 ${row.length > 1 ? "" : "w-full"} ${alignClass[el.align]}`}>
                                {renderElement(el)}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    };

    // ── Modo libre: cada elemento se posiciona en % del área útil ───────────
    // Se trabaja en porcentaje y no en milímetros para que el diseño sobreviva al cambio de
    // tamaño de etiqueta: lo que se arrastró en una 70×38 sigue proporcionado en una 40×30.
    const startDrag = (e, el) => {
        if (!editable) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect?.(el.id);

        const rect = areaRef.current?.getBoundingClientRect();
        if (!rect || !onDrag) return;

        const startX = e.clientX, startY = e.clientY;
        const originX = el.x, originY = el.y;

        const move = (ev) => {
            const dx = ((ev.clientX - startX) / rect.width) * 100;
            const dy = ((ev.clientY - startY) / rect.height) * 100;
            onDrag(el.id, {
                // El tope de la derecha depende del ancho de la caja, así no se sale por el borde
                x: Math.round(Math.max(0, Math.min(100 - el.w, originX + dx))),
                y: Math.round(Math.max(0, Math.min(96, originY + dy))),
            });
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const freeItems = LABEL_ELEMENTS
        .map(d => ({ id: d.id, ...template[d.id] }))
        .filter(e => e.on);

    return (
        <div
            className={`label-unit bg-white text-black overflow-hidden box-border ${layoutMode === "free" ? "block" : "flex flex-col"} ${border ? "border border-black" : ""}`}
            style={{ width: mm(width), height: mm(height), padding: mm(pad) }}
            onPointerDown={editable ? () => onSelect?.(null) : undefined}
        >
            {layoutMode === "free" ? (
                <div ref={areaRef} className="relative w-full h-full">
                    {freeItems.map(el => (
                        <div
                            key={el.id}
                            onPointerDown={e => startDrag(e, el)}
                            className={`absolute ${alignClass[el.align]} flex flex-col ${editable ? "cursor-move" : ""} ${editable && selectedId === el.id ? "outline outline-1 outline-brand-500" : ""}`}
                            style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%` }}
                        >
                            {renderElement(el)}
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {renderZone("top", "")}
                    {renderZone("mid", "flex-1 justify-center")}
                    {renderZone("bottom", "")}
                </>
            )}
        </div>
    );
}
