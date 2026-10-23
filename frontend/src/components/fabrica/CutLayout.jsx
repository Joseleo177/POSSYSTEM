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

function Drawing({ piece, mode, regions, selected = null, cut = null, onPick, label, maxHeight }) {
    const svg = useRef(null);
    const hatch = `rayado-${useId().replace(/:/g, "")}`;
    const size = useBox(svg);
    const { length, rot, Lv, Hv } = viewOf(piece, mode);
    const k = Math.max(Lv / size.w, size.h ? Hv / size.h : 0);   // milímetros por pixel
    const view = regions.map(r => (length ? { ...r, y: 0, dy: Hv } : swap(r, rot)));

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
    let line = null;
    if (sel && cut && cut.pos > 0) {
        line = cut.dir === "v"
            ? { x1: sel.x + cut.pos, y1: sel.y, x2: sel.x + cut.pos, y2: sel.y + sel.dy }
            : { x1: sel.x, y1: sel.y + cut.pos, x2: sel.x + sel.dx, y2: sel.y + cut.pos };
    }

    return (
        <div className="w-full">
            <svg ref={svg} viewBox={`0 0 ${Lv} ${Hv}`} className="w-full h-auto block text-content-subtle/40 dark:text-white/25 select-none"
                style={maxHeight ? { maxHeight } : undefined} preserveAspectRatio="xMidYMid meet">
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
