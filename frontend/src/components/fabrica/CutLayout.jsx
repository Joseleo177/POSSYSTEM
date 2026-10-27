import { useEffect, useId, useRef, useState } from "react";
import Segmented from "../ui/Segmented";
import { INPUT, UnitSwitch, fmtM, toMm, fromMm } from "./shared";

/**
 * El dibujo de cómo se picó una pieza. La lámina se pica de borde a borde, a lo largo o a lo
 * ancho (como corta la cizalla), así que cada corte parte un rectángulo en dos y todo lo que
 * queda son rectángulos: cada uno "se usó" o "vuelve como retazo" con sus medidas. Los tubos
 * solo se pican de través.
 *
 * Dos retazos que se tocan se pueden UNIR: en el taller no se separaron, son una sola pieza.
 * Si juntos forman un rectángulo quedan como uno; si no (una L), es una pieza irregular que
 * guarda su forma, y la próxima vez se dibuja con ella.
 *
 * Las zonas van en milímetros desde la esquina de la pieza: x a lo largo (length_mm), y a lo
 * ancho (width_mm). Para dibujar, el lado más largo va siempre en horizontal, como se ve una
 * lámina sobre la mesa; si la pieza es más ancha que larga se gira solo en pantalla.
 */

const hasShape = (piece) => Array.isArray(piece.shape) && piece.shape.length > 0;

export const canDraw = (piece, mode) => (mode === "length"
    ? piece.length_mm > 0
    : piece.width_mm > 0 && piece.length_mm > 0 && (!piece.is_irregular || hasShape(piece)));

// Cómo arranca el dibujo: la pieza entera (o cada parte de su forma) como usada.
export const initialRegions = (piece, mode) => (mode !== "length" && hasShape(piece)
    ? piece.shape.map(s => ({ x: s.x, y: s.y, dx: s.dx, dy: s.dy, kind: "usado" }))
    : [{ x: 0, y: 0, dx: piece.length_mm, dy: mode === "length" ? 0 : piece.width_mm, kind: "usado" }]);

// Lo que sobra con un lado de menos de 10 cm no se guarda como retazo: se cuenta como usado.
const MIN_USEFUL = 100;

/**
 * El dibujo sugerido al devolver: los cortes que la receta le asignó a la pieza (`cuts`:
 * [{ w, l, count }] en mm; sin w en tubos), acomodados como los picaría la cizalla.
 *
 * Por columnas a lo largo de la pieza: cada tipo de corte, del más grande al más chico, va en
 * columnas de su largo con tantos cortes apilados a lo ancho como quepan, probando el corte
 * girado y quedándose con lo que acomode más usando menos largo. Lo que sobra en cada columna
 * y al final es retazo si sirve. Es una sugerencia: el taller pudo cortarlo distinto.
 *
 * Devuelve { regions, placed, total }, o null si no hay nada que sugerir.
 */
export function suggestLayout(piece, mode, cuts) {
    if (!canDraw(piece, mode) || (mode !== "length" && hasShape(piece)) || !cuts?.length) return null;
    const length = mode === "length";
    const L = piece.length_mm, W = length ? 0 : piece.width_mm;
    const keep = (r) => r.dx >= MIN_USEFUL && (length || r.dy >= MIN_USEFUL);
    const regions = [];
    const total = cuts.reduce((s, c) => s + c.count, 0);
    let x = 0, placed = 0, lastRest = null;

    const rest = (r) => {
        // Sobrantes de columnas vecinas a la misma altura forman una sola tira.
        if (lastRest && lastRest.y === r.y && lastRest.dy === r.dy && lastRest.x + lastRest.dx === r.x) lastRest.dx += r.dx;
        else { lastRest = { ...r }; regions.push(lastRest); }
    };

    for (const c of [...cuts].sort((a, b) => b.l * (b.w || 1) - a.l * (a.w || 1))) {
        let left = c.count;
        if (length) {
            while (left > 0 && x + c.l <= L) { regions.push({ x, y: 0, dx: c.l, dy: 0, kind: "usado" }); x += c.l; left--; placed++; }
            continue;
        }
        // a: lo que ocupa a lo ancho; b: a lo largo.
        const opts = [[c.w, c.l], [c.l, c.w]].filter(([a]) => a > 0 && a <= W).map(([a, b]) => {
            const per = Math.floor(W / a);
            const fits = Math.min(left, Math.floor((L - x) / b) * per);
            return { a, b, per, fits, need: Math.ceil(left / per) * b };
        });
        if (!opts.length) continue;
        opts.sort((p, q) => q.fits - p.fits || p.need - q.need);
        const { a, b, per } = opts[0];
        while (left > 0 && x + b <= L) {
            const n = Math.min(left, per);
            for (let k = 0; k < n; k++) regions.push({ x, y: k * a, dx: b, dy: a, kind: "usado" });
            if (W - n * a > 0) rest({ x, y: n * a, dx: b, dy: W - n * a });
            x += b; left -= n; placed += n;
        }
    }
    if (!placed) return null;
    if (x < L) regions.push({ x, y: 0, dx: L - x, dy: W });
    for (const r of regions) if (!r.kind) r.kind = keep(r) ? "retazo" : "usado";
    return { regions, placed, total };
}

const areaOf = (r) => r.dx * r.dy;
const touches = (a, b, length) => {
    if (length) return a.x + a.dx === b.x || b.x + b.dx === a.x;
    const side = (a.x + a.dx === b.x || b.x + b.dx === a.x) && a.y < b.y + b.dy && b.y < a.y + a.dy;
    const top = (a.y + a.dy === b.y || b.y + b.dy === a.y) && a.x < b.x + b.dx && b.x < a.x + a.dx;
    return side || top;
};
const bbox = (rects) => {
    const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
    return { x, y, dx: Math.max(...rects.map(r => r.x + r.dx)) - x, dy: Math.max(...rects.map(r => r.y + r.dy)) - y };
};

/**
 * Los retazos que salen del dibujo, en orden: cada zona 'retazo' suelta, o todas las de un
 * mismo grupo como una pieza. Igual que remnantSpec en el servidor.
 */
export function remnantsOf(regions, mode) {
    const length = mode === "length";
    const out = [];
    const index = new Map();
    regions.forEach((r, i) => {
        if (r.kind !== "retazo") return;
        const key = r.group != null ? `g${r.group}` : `z${i}`;
        if (!index.has(key)) { index.set(key, out.length); out.push({ idx: [] }); }
        out[index.get(key)].idx.push(i);
    });
    return out.map(p => {
        const rects = p.idx.map(i => regions[i]);
        const b = bbox(rects);
        const area = rects.reduce((s, r) => s + areaOf(r), 0);
        const rect = length || area === b.dx * b.dy;
        const size = length ? Math.round(b.dx) / 1000 : Math.round(area / 1000) / 1000;
        // El rótulo va en la parte más grande.
        const main = p.idx.reduce((m, i) => (areaOf(regions[i]) > areaOf(regions[m]) ? i : m), p.idx[0]);
        return {
            idx: p.idx, main, size, irregular: !rect,
            width_mm: length ? null : b.dy, length_mm: b.dx,
        };
    });
}

// Medidas de una zona como pieza: ancho × largo, o solo largo en tubos.
export const regionDims = (r, mode) => (mode === "length"
    ? { width_mm: null, length_mm: r.dx }
    : { width_mm: r.dy, length_mm: r.dx });

const dimsLabel = (r, mode) => (mode === "length" ? `${fmtM(r.dx)} m` : `${fmtM(r.dy)} × ${fmtM(r.dx)} m`);
const m2 = (n) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m²`;

// Pantalla ↔ pieza: girar es cambiar x por y; aplicado dos veces vuelve a quedar igual.
const swap = (r, rot) => (rot ? { ...r, x: r.y, y: r.x, dx: r.dy, dy: r.dx } : r);

function viewOf(piece, mode) {
    const length = mode === "length";
    const rot = !length && piece.width_mm > piece.length_mm;
    const Lv = rot ? piece.width_mm : piece.length_mm;
    const Hv = length ? Math.max(Math.round(Lv * 0.1), 1) : (rot ? piece.length_mm : piece.width_mm);
    return { length, rot, Lv, Hv };
}

// Tamaño en pantalla del dibujo, para que textos y trazos midan lo mismo a cualquier escala.
// Con altura máxima el dibujo puede quedar más angosto que su caja: manda el lado que limita.
function useBox(ref) {
    const [box, setBox] = useState({ w: 520, h: 0 });
    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width || 520, h: e.contentRect.height || 0 }));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [ref]);
    return box;
}

// Lo que queda de [a, b] después de quitarle los tramos `cuts`.
function subtract(a, b, cuts) {
    let parts = [[a, b]];
    for (const [c, d] of cuts) {
        parts = parts.flatMap(([p, q]) => (d <= p || c >= q ? [[p, q]] : [[p, Math.max(p, c)], [Math.min(q, d), q]].filter(([u, v]) => v > u)));
    }
    return parts;
}

// El contorno de un retazo unido: los lados de cada parte menos los que comparte con otra.
function outline(rects) {
    const segs = [];
    rects.forEach((r, i) => {
        const others = rects.filter((_, j) => j !== i);
        const along = (y, side) => others.filter(o => (side === "top" ? o.y + o.dy === y : o.y === y)).map(o => [o.x, o.x + o.dx]);
        const across = (x, side) => others.filter(o => (side === "left" ? o.x + o.dx === x : o.x === x)).map(o => [o.y, o.y + o.dy]);
        for (const [p, q] of subtract(r.x, r.x + r.dx, along(r.y, "top"))) segs.push([p, r.y, q, r.y]);
        for (const [p, q] of subtract(r.x, r.x + r.dx, along(r.y + r.dy, "bottom"))) segs.push([p, r.y + r.dy, q, r.y + r.dy]);
        for (const [p, q] of subtract(r.y, r.y + r.dy, across(r.x, "left"))) segs.push([r.x, p, r.x, q]);
        for (const [p, q] of subtract(r.y, r.y + r.dy, across(r.x + r.dx, "right"))) segs.push([r.x + r.dx, p, r.x + r.dx, q]);
    });
    return segs;
}

// Paso de las marcas de la regla: el más fino que deje al menos ~56 px entre rótulos.
const STEPS = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
const rulerStep = (k) => STEPS.find(s => s / k >= 56) || STEPS[STEPS.length - 1];

// Regla a lo largo de un lado de la lámina, por fuera del dibujo. `along`: "x" arriba, "y" a
// la izquierda. `mark`: el tramo del pedazo elegido, resaltado sobre la regla.
function Ruler({ along, total, k, fmt, unit, mark }) {
    const step = rulerStep(k);
    const minor = step / 5 / k >= 7 ? step / 5 : step / 2 / k >= 7 ? step / 2 : null;
    const ticks = [];
    for (let v = 0; v < total - 1e-6; v += minor || step) ticks.push(v);
    const top = along === "x";
    const at = (v, d) => (top ? { x: v, y: -d * k } : { x: -d * k, y: v });
    const line = (v, d0, d1, cls, w = 1) => {
        const a = at(v, d0), b = at(v, d1);
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" strokeWidth={w} className={cls} />;
    };
    const text = (v, t, anchor, strong) => {
        const p = at(v, top ? 14 : 13);
        return (
            <text x={p.x} y={p.y} fontSize={10 * k} textAnchor={top ? anchor : "end"} dominantBaseline={top ? "auto" : "middle"}
                className={strong ? "fill-content dark:fill-white font-semibold" : "fill-content-subtle dark:fill-white/50"}>{t}</text>
        );
    };
    // El rótulo del final lleva la medida total; los que quedan muy cerca de él se omiten.
    const labels = ticks.filter(v => Math.abs(v / step - Math.round(v / step)) < 1e-6 && total - v >= step * 0.6);
    return (
        <g pointerEvents="none">
            {top
                ? <line x1={0} y1={-3 * k} x2={total} y2={-3 * k} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-content-subtle/50 dark:stroke-white/25" />
                : <line x1={-3 * k} y1={0} x2={-3 * k} y2={total} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-content-subtle/50 dark:stroke-white/25" />}
            {mark && (top
                ? <line x1={mark[0]} y1={-3 * k} x2={mark[1]} y2={-3 * k} vectorEffect="non-scaling-stroke" strokeWidth={3} className="stroke-brand-500 dark:stroke-brand-400" />
                : <line x1={-3 * k} y1={mark[0]} x2={-3 * k} y2={mark[1]} vectorEffect="non-scaling-stroke" strokeWidth={3} className="stroke-brand-500 dark:stroke-brand-400" />)}
            {ticks.map(v => {
                const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
                return <g key={v}>{line(v, 3, major ? 9 : 6, "stroke-content-subtle/60 dark:stroke-white/30")}</g>;
            })}
            {line(total, 3, 9, "stroke-content-subtle/60 dark:stroke-white/30")}
            {labels.map(v => <g key={`l${v}`}>{text(v, fmt(v), v === 0 ? "start" : "middle")}</g>)}
            {text(total, `${fmt(total)} ${unit}`, "end", true)}
        </g>
    );
}

// Rótulo con fondo sobre el dibujo (las medidas a cada lado de la línea de corte).
function Tag({ x, y, k, text, anchor = "middle", tone = "cut" }) {
    const w = (text.length * 6.6 + 12) * k, h = 18 * k;
    const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    return (
        <g pointerEvents="none">
            <rect x={left} y={y - h / 2} width={w} height={h} rx={4 * k} vectorEffect="non-scaling-stroke" strokeWidth={1}
                className={tone === "cut"
                    ? "fill-white dark:fill-surface-dark-2 stroke-red-500/60 dark:stroke-red-400/60"
                    : "fill-white dark:fill-surface-dark-2 stroke-content-subtle/40 dark:stroke-white/20"} />
            <text x={left + w / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11 * k}
                className="fill-content dark:fill-white font-semibold tabular-nums">{text}</text>
        </g>
    );
}

function Drawing({ piece, mode, regions, selected = null, cut = null, onPick, label, maxHeight, guide = null, unit = null, rulers = false }) {
    const svg = useRef(null);
    const hatch = `rayado-${useId().replace(/:/g, "")}`;
    const size = useBox(svg);
    const { length, rot, Lv, Hv } = viewOf(piece, mode);
    const k = Math.max(Lv / size.w, size.h ? Hv / size.h : 0);   // milímetros por pixel
    const view = regions.map(r => (length ? { ...r, y: 0, dy: Hv } : swap(r, rot)));
    // Medidas en la unidad que usa el taller (m, cm o mm).
    const u = unit || "m";
    const num = (mm) => (unit ? fromMm(mm, unit) || "0" : fmtM(mm));
    const fmtU = (mm) => `${num(mm)} ${u}`;
    // Guía que sigue al mouse dentro del pedazo elegido: dice dónde caería el corte antes de tocar.
    const [hover, setHover] = useState(null);

    // Retazos unidos: se dibuja el contorno de la pieza entera, sin la raya entre sus partes.
    const groups = new Map();
    view.forEach((r, i) => { if (r.kind === "retazo" && r.group != null) groups.set(r.group, [...(groups.get(r.group) || []), i]); });

    // Dónde cayó el toque, en milímetros del dibujo.
    const pointAt = (e) => {
        const pt = svg.current.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.current.getScreenCTM().inverse());
        return { x: p.x, y: p.y };
    };

    const sel = selected != null ? view[selected] : null;
    const lineAt = (dir, pos) => (dir === "v"
        ? { x1: sel.x + pos, y1: sel.y, x2: sel.x + pos, y2: sel.y + sel.dy }
        : { x1: sel.x, y1: sel.y + pos, x2: sel.x + sel.dx, y2: sel.y + pos });
    const line = sel && cut && cut.pos > 0 ? lineAt(cut.dir, cut.pos) : null;
    const ghost = sel && guide && hover != null && hover !== cut?.pos ? lineAt(guide, hover) : null;

    // Solo con mouse: en el táctil arrastrar desplaza la página, y el toque ya pone la línea.
    const onMove = (e) => {
        if (!guide || !sel || e.pointerType !== "mouse") return;
        const p = pointAt(e);
        if (p.x < sel.x || p.x > sel.x + sel.dx || p.y < sel.y || p.y > sel.y + sel.dy) { setHover(null); return; }
        const span = guide === "v" ? sel.dx : sel.dy;
        const raw = guide === "v" ? p.x - sel.x : p.y - sel.y;
        setHover(Math.min(Math.max(Math.round(raw / 10) * 10, 10), span - 10));
    };

    // Las medidas a cada lado de la línea: lo que el taller lee en la cinta antes de picar.
    const tags = (dir, pos, tone) => {
        const span = dir === "v" ? sel.dx : sel.dy;
        if (dir === "v") {
            const x = sel.x + pos, y = sel.y + Math.min(16 * k, sel.dy / 2);
            return (
                <>
                    <Tag k={k} x={x - 5 * k} y={y} anchor="end" text={`← ${fmtU(pos)}`} tone={tone} />
                    <Tag k={k} x={x + 5 * k} y={y} anchor="start" text={`${fmtU(span - pos)} →`} tone={tone} />
                </>
            );
        }
        const y = sel.y + pos, x = sel.x + 8 * k;
        return (
            <>
                <Tag k={k} x={x} y={y - 13 * k} anchor="start" text={`↑ ${fmtU(pos)}`} tone={tone} />
                <Tag k={k} x={x} y={y + 13 * k} anchor="start" text={`↓ ${fmtU(span - pos)}`} tone={tone} />
            </>
        );
    };

    // Con reglas, el dibujo deja sitio arriba (y a la izquierda en láminas) para las medidas.
    const pad = rulers ? `pt-6 ${length ? "px-1" : "pl-11 pr-1"}` : "";

    return (
        <div className={`w-full ${pad}`}>
            <svg ref={svg} viewBox={`0 0 ${Lv} ${Hv}`} className="w-full h-auto block text-content-subtle/40 dark:text-white/25 select-none overflow-visible"
                style={maxHeight ? { maxHeight } : undefined} preserveAspectRatio="xMidYMid meet"
                onPointerMove={guide ? onMove : undefined} onPointerLeave={guide ? () => setHover(null) : undefined}>
                <defs>
                    <pattern id={hatch} patternUnits="userSpaceOnUse" width={10 * k} height={10 * k} patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2={10 * k} stroke="currentColor" strokeWidth={2.5 * k} />
                    </pattern>
                </defs>
                {view.map((r, i) => {
                    const retazo = r.kind === "retazo";
                    const grouped = retazo && r.group != null;
                    return (
                        <g key={i} onClick={onPick ? (e) => onPick(i, pointAt(e), view[i]) : undefined}
                            className={onPick ? "cursor-pointer" : undefined}>
                            <rect x={r.x} y={r.y} width={r.dx} height={r.dy}
                                className={retazo ? "fill-brand-500/15 dark:fill-brand-400/20" : "fill-surface-2 dark:fill-white/[0.04]"} />
                            {!retazo && <rect x={r.x} y={r.y} width={r.dx} height={r.dy} fill={`url(#${hatch})`} />}
                            {!grouped && (
                                <rect x={r.x} y={r.y} width={r.dx} height={r.dy} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1}
                                    className={retazo ? "stroke-brand-600 dark:stroke-brand-400" : "stroke-content-subtle/60 dark:stroke-white/30"} />
                            )}
                        </g>
                    );
                })}
                {[...groups.values()].map(idx => (
                    <g key={`g${idx[0]}`} pointerEvents="none">
                        {outline(idx.map(i => view[i])).map(([x1, y1, x2, y2], j) => (
                            <line key={j} x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" strokeWidth={1.5}
                                className="stroke-brand-600 dark:stroke-brand-400" />
                        ))}
                    </g>
                ))}
                {sel && (
                    <rect x={sel.x} y={sel.y} width={sel.dx} height={sel.dy} fill="none" pointerEvents="none"
                        vectorEffect="non-scaling-stroke" strokeWidth={2.5} className="stroke-content dark:stroke-white" />
                )}
                {view.map((r, i) => {
                    // Una línea en tubos; el texto solo va si cabe en el pedazo.
                    const raw = label?.(regions[i], i);
                    if (!raw) return null;
                    const text = length ? [raw.join(" · ")] : raw;
                    const fits = r.dx / k > Math.max(...text.map(t => t.length)) * 6.6 + 8 && r.dy / k > text.length * 15 + 4;
                    if (!fits) return null;
                    return (
                        <text key={`t${i}`} x={r.x + r.dx / 2} y={r.y + r.dy / 2} textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                            fontSize={12 * k} className={r.kind === "retazo" ? "fill-brand-700 dark:fill-brand-300 font-semibold" : "fill-content-subtle dark:fill-white/60"}>
                            {text.map((t, j) => (
                                <tspan key={j} x={r.x + r.dx / 2} dy={j === 0 ? `${-(text.length - 1) * 0.6}em` : "1.2em"}>{t}</tspan>
                            ))}
                        </text>
                    );
                })}
                {line && (
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} vectorEffect="non-scaling-stroke" strokeWidth={2}
                        strokeDasharray="6 4" pointerEvents="none" className="stroke-red-600 dark:stroke-red-400" />
                )}
                {ghost && (
                    <line x1={ghost.x1} y1={ghost.y1} x2={ghost.x2} y2={ghost.y2} vectorEffect="non-scaling-stroke" strokeWidth={1.5}
                        strokeDasharray="4 4" pointerEvents="none" className="stroke-content dark:stroke-white" />
                )}
                {sel && (ghost ? tags(guide, hover, "guide") : line ? tags(cut.dir, cut.pos, "cut") : null)}
                {rulers && size.w > 0 && (
                    <>
                        <Ruler along="x" total={Lv} k={k} fmt={num} unit={u} mark={sel && view.length > 1 ? [sel.x, sel.x + sel.dx] : null} />
                        {!length && <Ruler along="y" total={Hv} k={k} fmt={num} unit={u} mark={sel && view.length > 1 ? [sel.y, sel.y + sel.dy] : null} />}
                    </>
                )}
            </svg>
        </div>
    );
}

// Rótulo de cada zona: el retazo (suelto, o unido en su parte más grande) o "Se usó".
function labeler(regions, mode, name) {
    const rems = remnantsOf(regions, mode);
    const byIdx = new Map();
    rems.forEach((p, n) => p.idx.forEach(i => byIdx.set(i, { p, n })));
    return (r, i) => {
        if (r.kind !== "retazo") return ["Se usó", dimsLabel(r, mode)];
        const { p, n } = byIdx.get(i);
        if (p.idx.length === 1) return [name(r, n), dimsLabel(r, mode)];
        if (i !== p.main) return null;
        return [name(r, n), p.irregular ? `Una pieza · ${m2(p.size)}` : `Una pieza · ${dimsLabel(regionDims({ dx: p.length_mm, dy: p.width_mm }, mode), mode)}`];
    };
}

/**
 * Editor del corte. `value` son las zonas en coordenadas de la pieza; arranca con la pieza
 * entera "usada" (se gastó completa) y cada corte la parte en dos.
 */
export function CutEditor({ piece, mode, value, onChange, unit, setUnit }) {
    const { length, rot } = viewOf(piece, mode);
    const [selected, setSelected] = useState(0);
    const [dir, setDir] = useState("v");
    const [pos, setPos] = useState("");
    const [history, setHistory] = useState([]);
    const [joining, setJoining] = useState(false);
    const [msg, setMsg] = useState("");
    const drawRef = useRef(null);

    const view = value.map(r => swap(r, rot));
    const sel = view[selected];
    const span = sel ? (dir === "v" || length ? sel.dx : sel.dy) : 0;
    const posMm = toMm(pos, unit);
    const valid = posMm > 0 && posMm < span;

    const commit = (next, select) => {
        setHistory(h => [...h, value]);
        onChange(next);
        setSelected(select);
        setPos("");
        setJoining(false);
    };
    // Las zonas que forman el mismo retazo que la i (ella sola si no está unida).
    const membersOf = (list, i) => (list[i].kind === "retazo" && list[i].group != null
        ? list.map((r, j) => (r.kind === "retazo" && r.group === list[i].group ? j : -1)).filter(j => j >= 0)
        : [i]);
    // Deshace la unión del retazo de la zona i: sus partes vuelven a ser retazos sueltos.
    const dissolve = (list, i) => {
        const g = list[i].group;
        return g == null ? list : list.map(r => (r.group === g ? (({ group, ...rest }) => rest)(r) : r));
    };

    const join = (j) => {
        setMsg("");
        if (value[j].kind !== "retazo") { setMsg("Solo se unen retazos: marca ese pedazo como retazo primero."); setJoining(false); return; }
        const a = membersOf(value, selected), b = membersOf(value, j);
        if (a.includes(j)) { setJoining(false); return; }
        if (!a.some(x => b.some(y => touches(value[x], value[y], length)))) {
            setMsg("Solo se unen retazos que se tocan.");
            setJoining(false);
            return;
        }
        const all = [...a, ...b].sort((p, q) => p - q);
        const rects = all.map(i => value[i]);
        const box = bbox(rects);
        const isRect = length || rects.reduce((s, r) => s + areaOf(r), 0) === box.dx * box.dy;
        let next;
        if (isRect) {
            // Juntos son un rectángulo: queda una sola zona, como si no se hubiera picado.
            next = value.flatMap((r, i) => (i === all[0] ? [{ ...box, dy: length ? 0 : box.dy, kind: "retazo" }] : all.includes(i) ? [] : [r]));
        } else {
            const group = value[selected].group ?? value[j].group ?? Math.max(0, ...value.map(r => r.group || 0)) + 1;
            next = value.map((r, i) => (all.includes(i) ? { ...r, group } : r));
        }
        commit(next, all[0]);
    };

    const pick = (i, at, r) => {
        if (joining) { join(i); return; }
        setMsg("");
        if (i !== selected) { setSelected(i); setPos(""); return; }
        // Tocar dentro del pedazo elegido pone ahí la línea de corte (redondeada al centímetro).
        const raw = dir === "v" || length ? at.x - r.x : at.y - r.y;
        const mm = Math.min(Math.max(Math.round(raw / 10) * 10, 10), (dir === "v" || length ? r.dx : r.dy) - 10);
        setPos(fromMm(mm, unit));
    };

    const split = () => {
        if (!valid) return;
        // Picar una parte de un retazo unido lo vuelve a separar.
        const base = dissolve(value, selected).map(r => swap(r, rot));
        const s = base[selected];
        const a = dir === "v" || length ? { ...s, dx: posMm } : { ...s, dy: posMm };
        const b = dir === "v" || length
            ? { ...s, x: s.x + posMm, dx: s.dx - posMm }
            : { ...s, y: s.y + posMm, dy: s.dy - posMm };
        // Lo medido es lo que se usó; lo otro, de entrada, vuelve como retazo.
        const next = [...base];
        next.splice(selected, 1, { ...a, kind: "usado" }, { ...b, kind: "retazo" });
        commit(next.map(r => swap(r, rot)), selected + 1);
    };
    const toggle = (kind) => {
        if (kind === value[selected].kind) return;
        commit(dissolve(value, selected).map((r, i) => (i === selected ? { ...r, kind } : r)), selected);
    };
    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        setHistory(h => h.slice(0, -1));
        onChange(prev);
        setSelected(Math.min(selected, prev.length - 1));
        setPos("");
        setJoining(false);
        setMsg("");
    };

    const from = length || dir === "v" ? "desde la izquierda" : "desde arriba";
    const label = labeler(value, mode, (r, n) => `Retazo ${n + 1}`);
    const current = value[selected];
    const united = current && current.kind === "retazo" && current.group != null;
    const canJoin = current && current.kind === "retazo" && value.filter(r => r.kind === "retazo").length > 1;

    return (
        <div className="space-y-3">
            <div ref={drawRef} className="scroll-mt-4">
                <Drawing piece={piece} mode={mode} regions={value} selected={selected} onPick={pick}
                    cut={valid && !joining ? { dir: length ? "v" : dir, pos: posMm } : null}
                    guide={joining ? null : (length ? "v" : dir)} unit={unit} rulers
                    label={label} maxHeight="46vh" />
            </div>

            {sel && (
                <div className="rounded-xl bg-surface-2/70 dark:bg-white/[0.04] p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[13px]">
                            <span className="font-semibold text-content dark:text-white">Pedazo elegido</span>
                            <span className="text-content-subtle tabular-nums"> · {dimsLabel(current, mode)}{united ? " · parte de un retazo unido" : ""}</span>
                        </div>
                        <Segmented value={current.kind} onChange={toggle}
                            options={[{ key: "usado", label: "Se usó" }, { key: "retazo", label: "Vuelve como retazo" }]} />
                    </div>

                    {joining ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-500/40 bg-white dark:bg-white/[0.04] px-3 py-2">
                            <span className="text-[13px] text-content dark:text-white">Toca el retazo que se une con este.</span>
                            <button onClick={() => setJoining(false)} className="h-8 px-3 rounded-lg text-[13px] font-medium btn-outline shrink-0">Cancelar</button>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            {!length && (
                                <Segmented value={dir} onChange={(d) => { setDir(d); setPos(""); }}
                                    options={[{ key: "v", label: "Corte vertical" }, { key: "h", label: "Corte horizontal" }]} />
                            )}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="relative flex-1 min-w-0">
                                    <input value={pos} onChange={e => setPos(e.target.value)} inputMode="decimal"
                                        onKeyDown={e => { if (e.key === "Enter") split(); }}
                                        placeholder={`A cuánto, ${from}`} className={`${INPUT} pr-10 tabular-nums`} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unit}</span>
                                </div>
                                <button onClick={split} disabled={!valid}
                                    className="btn-accent h-10 px-4 rounded-lg text-[13px] font-semibold shrink-0 disabled:opacity-40">
                                    Picar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className={`text-[12px] flex-1 min-w-0 ${msg ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                            {msg || (valid
                                ? `Quedan ${fmtM(posMm)} m y ${fmtM(span - posMm)} m. Lo medido queda como usado.`
                                : "Toca el pedazo para elegirlo y vuelve a tocar donde fue el corte, o escribe la medida.")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {united ? (
                                <button onClick={() => commit(dissolve(value, selected), selected)}
                                    className="h-[36px] px-3 rounded-lg text-[13px] font-medium btn-outline">Separar</button>
                            ) : canJoin && !joining && (
                                <button onClick={() => {
                                    setMsg("");
                                    setJoining(true);
                                    // En el celular el dibujo suele quedar arriba, fuera de la vista: se trae para tocar el otro retazo.
                                    drawRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                }}
                                    className="h-[36px] px-3 rounded-lg text-[13px] font-medium btn-outline">Unir con otro retazo</button>
                            )}
                            {setUnit && <UnitSwitch unit={unit} setUnit={(u) => { const mm = toMm(pos, unit); setUnit(u); setPos(mm > 0 ? fromMm(mm, u) : ""); }} />}
                            <button onClick={undo} disabled={!history.length}
                                className="h-[36px] px-3 rounded-lg text-[13px] font-medium btn-outline disabled:opacity-40">
                                Deshacer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// El dibujo guardado, para el historial y el detalle de la orden: cada retazo con su número.
export function CutPreview({ piece, mode, layout, maxHeight = "180px" }) {
    if (!layout?.regions?.length || !canDraw(piece, mode)) return null;
    return (
        <Drawing piece={piece} mode={mode} regions={layout.regions} maxHeight={maxHeight}
            label={labeler(layout.regions, mode, (r) => `#${r.code || "retazo"}`)} />
    );
}
