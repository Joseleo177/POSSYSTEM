import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Cuadrícula del plano: la misma que valida el servidor (services/tables.js).
export const COLS = 40;
export const ROWS = 24;

// Minutos desde que se abrió la cuenta, contra la hora que pase quien dibuja.
export const minutosDesde = (iso, ahora) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));

const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);

// Lo que la cocina dice de una mesa: con una sola cuenta "lista" ya hay algo que llevar.
const cocinaDe = (cuentas) => {
    if (cuentas.some(c => c.kitchen_status === "lista")) return "lista";
    if (cuentas.some(c => c.kitchen_status === "nueva" || c.kitchen_status === "preparando")) return "cocina";
    return null;
};

// Desde cuándo la mesa pidió la cuenta (la primera de sus cuentas que la pidió), o null.
export const pidioDesde = (cuentas) => {
    const t = cuentas.map(c => c.bill_requested_at).filter(Boolean).map(d => new Date(d).getTime());
    return t.length ? Math.min(...t) : null;
};

// Marca de "pidió la cuenta": arriba a la izquierda, del lado contrario al check de cocina.
const MarcaCuenta = ({ className = "absolute -top-1 -left-1" }) => (
    <span title="Pidió la cuenta" className={`${className} w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-dark`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m-6 4h6m-6 4h3M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /></svg>
    </span>
);

const MarcaLista = ({ className = "absolute -top-1 -right-1" }) => (
    <span title="Pedido listo en cocina" className={`${className} w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-dark`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
    </span>
);

// ── Geometría de la mesa ────────────────────────────────────────────────────────────────
// Todo en celdas. La "base" es la mesa sin girar con sus sillas; la huella (w y h guardados)
// es la caja que ocupa ya girada, que es lo que usan los choques y los bordes del plano.

// Tamaños del editor, en celdas, según la forma (base sin girar).
export const TAMANOS = {
    square: { S: [3, 3], M: [4, 4], L: [5, 5] },
    round:  { S: [3, 3], M: [4, 4], L: [5, 5] },
    rect:   { S: [6, 3], M: [8, 4], L: [12, 4] },
};
// Giros que admite cada forma: la redonda no gira y la cuadrada a 90° queda igual.
export const GIROS = { square: [0, 45], round: [0], rect: [0, 90, 45, 135] };

const MARGEN = 0.6;    // franja de la base donde van las sillas
const SILLA = 0.45;    // fondo del asiento
const HUECO = 0.08;    // entre el borde del tablero y la silla

const tablero = ([bw, bh]) => [bw - 2 * MARGEN, bh - 2 * MARGEN];

export const giroDe = (t) => ((GIROS[t.shape] || [0]).includes(t.rotation) ? t.rotation : 0);

/** Huella en la cuadrícula de una mesa de base [bw, bh] girada `rot` grados. */
export function huella(shape, base, rot) {
    const [bw, bh] = base;
    if (!rot || shape === "round") return [bw, bh];
    if (rot === 90) return [bh, bw];
    // En diagonal: la caja del tablero girado, y una celda más en la larga para sus sillas.
    const [tw, th] = tablero(base);
    const s = Math.min(12, Math.ceil((tw + th) / Math.SQRT2 - 0.05) + (shape === "rect" ? 1 : 0));
    return [s, s];
}

const tamanoGuardado = (t) => Object.entries(TAMANOS[t.shape] || TAMANOS.square)
    .find(([, b]) => { const [w, h] = huella(t.shape, b, giroDe(t)); return w === t.w && h === t.h; })?.[0];

/** Tamaño (S, M, L) de una mesa; "M" si sus medidas no son de ninguno. */
export const tamanoDe = (t) => tamanoGuardado(t) || "M";

// Base sin girar de una mesa guardada. Si sus medidas no son de un tamaño del editor, se
// deshace el giro sobre la huella.
function baseDe(t) {
    const k = tamanoGuardado(t);
    if (k) return TAMANOS[t.shape][k];
    const rot = giroDe(t);
    if (rot === 90) return [t.h, t.w];
    if (rot) return [t.w, t.w];
    return [t.w, t.h];
}

/**
 * Sillas alrededor del tablero, con el centro de la mesa en el origen: { x, y, a, ancho },
 * donde `a` gira la silla (0 = del lado de abajo, mirando a la mesa). En la larga van en los
 * lados largos, y en las cabeceras desde 6 puestos; en la cuadrada, de a una por lado.
 * Si no caben todas se dibujan las que caben: el número de puestos lo dice el texto.
 */
function sillasDe(shape, [tw, th], n) {
    const cabe = (largo) => Math.max(1, Math.floor(largo / 0.85));
    const out = [];
    if (shape === "round") {
        const r = tw / 2;
        const k = Math.min(n, cabe(2 * Math.PI * r));
        const ancho = Math.min(0.72, ((2 * Math.PI * r) / k) * 0.8);
        for (let i = 0; i < k; i += 1) {
            const fi = -Math.PI / 2 + (2 * Math.PI * i) / k;
            const d = r + HUECO;
            out.push({ x: d * Math.cos(fi), y: d * Math.sin(fi), a: (fi * 180) / Math.PI - 90, ancho });
        }
        return out;
    }
    // Cuántas por lado: arriba, abajo, izquierda, derecha.
    let lados;
    if (shape === "rect") {
        const cab = n >= 6 ? 1 : 0;
        const largo = n - 2 * cab;
        lados = [Math.ceil(largo / 2), Math.floor(largo / 2), cab, cab];
        // Lo que no entra en los lados largos va a las cabeceras.
        const capL = cabe(tw), capC = cabe(th);
        const sobra = Math.max(0, lados[0] - capL) + Math.max(0, lados[1] - capL);
        lados = [
            Math.min(lados[0], capL), Math.min(lados[1], capL),
            Math.min(capC, cab + Math.ceil(sobra / 2)), Math.min(capC, cab + Math.floor(sobra / 2)),
        ];
    } else {
        lados = [0, 0, 0, 0];
        for (let i = 0; i < n; i += 1) lados[i % 4] += 1;
        lados = lados.map(k => Math.min(k, cabe(tw)));
    }
    const lado = (k, largo, punto, a) => {
        const ancho = Math.min(0.72, (largo / Math.max(k, 1)) * 0.82);
        for (let i = 0; i < k; i += 1) out.push({ ...punto(-largo / 2 + (largo * (i + 0.5)) / k), a, ancho });
    };
    lado(lados[0], tw, (p) => ({ x: p, y: -th / 2 - HUECO }), 180);
    lado(lados[1], tw, (p) => ({ x: p, y: th / 2 + HUECO }), 0);
    lado(lados[2], th, (p) => ({ x: -tw / 2 - HUECO, y: p }), 90);
    lado(lados[3], th, (p) => ({ x: tw / 2 + HUECO, y: p }), -90);
    return out;
}

/**
 * La mesa vista desde arriba, con volumen: sombra hacia abajo a la derecha (la luz no gira
 * con la mesa), tablero de madera con canto y sillas. Ocupada, las sillas se separan un poco
 * y aparecen los platos. Es SVG plano, unas decenas de nodos por mesa: nada de 3D real.
 */
const Dibujo = memo(function Dibujo({ shape, w, h, bw, bh, rot, seats, ocupada }) {
    const id = useId().replace(/:/g, "");
    const [tw, th] = tablero([bw, bh]);
    const redonda = shape === "round";
    const rx = redonda ? tw / 2 : Math.min(0.35, Math.min(tw, th) * 0.12);
    const sillas = sillasDe(shape, [tw, th], seats);
    const afuera = ocupada ? 0.14 : 0;
    const platos = ocupada && Math.min(tw, th) >= 2.3;
    const giro = `translate(${w / 2} ${h / 2}) rotate(${rot})`;

    const forma = (inset, props) => (redonda
        ? <circle r={tw / 2 - inset} {...props} />
        : <rect x={-tw / 2 + inset} y={-th / 2 + inset} width={tw - 2 * inset} height={th - 2 * inset} rx={Math.max(0, rx - inset)} {...props} />);

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" aria-hidden="true">
            <defs>
                {/* La luz queda fija en la pantalla aunque la mesa gire. */}
                <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1" gradientTransform={`rotate(${-rot} .5 .5)`}>
                    <stop offset="0" className="[stop-color:#ecdcc1] dark:[stop-color:#7d644b]" />
                    <stop offset="1" className="[stop-color:#cfac7e] dark:[stop-color:#54412f]" />
                </linearGradient>
            </defs>

            {/* Sombras del tablero: una ancha y suave, otra cercana. */}
            <g transform="translate(0.18 0.3)"><g transform={giro}>{forma(-0.05, { className: "fill-black/[0.06] dark:fill-black/30" })}</g></g>
            <g transform="translate(0.07 0.13)"><g transform={giro}>{forma(0, { className: "fill-black/[0.13] dark:fill-black/40" })}</g></g>

            <g transform={giro}>
                {sillas.map((s, i) => (
                    <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.a}) translate(0 ${afuera})`}>
                        <rect x={-s.ancho / 2 + 0.04} y={0.07} width={s.ancho} height={SILLA} rx={0.13} className="fill-black/10 dark:fill-black/30" />
                        <rect x={-s.ancho / 2} y={0} width={s.ancho} height={SILLA} rx={0.13} className="fill-[#757d8a] dark:fill-[#8a94a3]" />
                        <rect x={-s.ancho / 2} y={SILLA - 0.16} width={s.ancho} height={0.16} rx={0.07} className="fill-[#4b5260] dark:fill-[#aab3c0]" />
                    </g>
                ))}

                {forma(0, { fill: `url(#m${id})`, className: "stroke-[#a8865b] dark:stroke-[#3a2c1f]", strokeWidth: 0.06 })}
                {/* Canto: un filo claro por dentro que levanta el tablero. */}
                {forma(0.12, { fill: "none", className: "stroke-white/50 dark:stroke-white/10", strokeWidth: 0.05 })}
                {/* Veta, a lo largo del tablero. */}
                {!redonda && tw > 1.6 && [-0.24, 0.06, 0.28].map((f, i) => (
                    <line key={i} x1={-tw / 2 + 0.3} x2={tw / 2 - 0.3} y1={th * f} y2={th * f + 0.05}
                        className="stroke-[#7a5a35]/[0.14] dark:stroke-black/25" strokeWidth={0.035} strokeLinecap="round" />
                ))}

                {platos && sillas.map((s, i) => (
                    <g key={`p${i}`} transform={`translate(${s.x} ${s.y}) rotate(${s.a})`}>
                        <circle cy={-HUECO - 0.37} r={0.25} className="fill-white dark:fill-[#e9e5df] stroke-black/15" strokeWidth={0.03} />
                        <circle cy={-HUECO - 0.37} r={0.15} fill="none" className="stroke-black/10" strokeWidth={0.025} />
                    </g>
                ))}
            </g>
        </svg>
    );
});

// Caja (en celdas) donde entra el texto sin salirse del tablero, según forma y giro.
function cajaTexto(shape, [tw, th], rot) {
    if (shape === "round") return [tw * 0.84, tw * 0.52];
    if (rot === 90) return [th - 0.1, tw - 0.1];
    if (rot) {
        // Un rectángulo cabe en la franja diagonal si su ancho más su alto no pasa de esto.
        const s = Math.min(tw, th) * Math.SQRT2;
        return [s * 0.7, s * 0.34];
    }
    return [tw - 0.1, th - 0.1];
}

/**
 * Una mesa del plano, dibujada con sus sillas. Libre, el nombre va sobre la madera; ocupada,
 * las sillas se separan, aparecen los platos y una etiqueta blanca con el total y el tiempo.
 * El único color de señal va en esa etiqueta: check verde cuando la cocina tiene algo listo
 * y ámbar cuando pidieron la cuenta.
 */
function Mesa({ t, cuentas, cell, ahora, fmtTotal, seleccionada, resaltada, editable, onPointerDown, onClick }) {
    const ocupada = cuentas.length > 0;
    const cocina = cocinaDe(cuentas);
    const total = ocupada && fmtTotal ? fmtTotal(cuentas) : null;
    const abierta = ocupada ? Math.min(...cuentas.map(c => new Date(c.created_at).getTime())) : null;
    const pidio = ocupada ? pidioDesde(cuentas) : null;
    const rot = giroDe(t);
    const [bw, bh] = baseDe(t);
    const [cw, ch] = cajaTexto(t.shape, tablero([bw, bh]), rot).map(v => Math.max(0, v * cell));
    const nombrePx = Math.max(10, Math.min(15, cell * 0.5));
    const datoPx = Math.max(9, Math.min(12, cell * 0.4));
    // Cuántos renglones entran en el tablero (la etiqueta suma su relleno).
    const renglones = Math.max(1, 1 + Math.floor((ch - nombrePx * 1.2 - (ocupada ? 6 : 0)) / (datoPx * 1.25)));

    return (
        <button
            type="button"
            onPointerDown={onPointerDown}
            onClick={onClick}
            title={`${t.name} · ${t.seats} ${t.seats === 1 ? "puesto" : "puestos"}`}
            style={{
                left: `${(t.x / COLS) * 100}%`, top: `${(t.y / ROWS) * 100}%`,
                width: `${(t.w / COLS) * 100}%`, height: `${(t.h / ROWS) * 100}%`,
                touchAction: editable ? "none" : undefined,
            }}
            className={`absolute select-none transition-transform ${editable ? "cursor-grab active:cursor-grabbing" : "active:scale-[0.97]"}`}
        >
            <Dibujo shape={t.shape} w={t.w} h={t.h} bw={bw} bh={bh} rot={rot} seats={t.seats} ocupada={ocupada} />

            {(seleccionada || resaltada) && (
                <span className={`absolute -inset-1 pointer-events-none border-2 border-brand-500 ${editable ? "border-dashed" : ""} ${t.shape === "round" ? "rounded-full" : "rounded-xl"}`} />
            )}

            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {ocupada ? (
                    <span style={{ maxWidth: cw + 8 }}
                        className="relative flex flex-col items-center leading-tight text-center px-1.5 py-[3px] rounded-md bg-white/95 dark:bg-[#1d2025]/95 shadow-[0_1px_3px_rgb(0_0_0/0.18)] ring-1 ring-black/5 dark:ring-white/10">
                        <span style={{ fontSize: nombrePx }} className="font-semibold text-content dark:text-white truncate max-w-full">{t.name}</span>
                        {renglones >= 2 && total && (
                            <span style={{ fontSize: datoPx }} className="font-semibold text-content dark:text-white tabular-nums truncate max-w-full">{total}</span>
                        )}
                        {renglones >= 3 && (pidio ? (
                            <span style={{ fontSize: datoPx }} className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums whitespace-nowrap">
                                Cuenta · {fmtMin(minutosDesde(pidio, ahora))}
                            </span>
                        ) : (
                            <span style={{ fontSize: datoPx }} className="text-content-subtle tabular-nums whitespace-nowrap">
                                {fmtMin(minutosDesde(abierta, ahora))}{cuentas.length > 1 ? ` · ${cuentas.length} cuentas` : ""}
                            </span>
                        ))}
                        {cocina === "lista" && <MarcaLista className="absolute -top-2.5 -right-2.5" />}
                        {pidio && <MarcaCuenta className="absolute -top-2.5 -left-2.5" />}
                    </span>
                ) : (
                    <span style={{ maxWidth: cw }} className="flex flex-col items-center leading-tight text-center">
                        <span style={{ fontSize: nombrePx }} className="font-semibold text-[#3d2f20] dark:text-white truncate max-w-full">{t.name}</span>
                        {renglones >= 2 && (
                            <span style={{ fontSize: datoPx }} className="text-[#6b5640] dark:text-white/60 whitespace-nowrap">{t.seats} {t.seats === 1 ? "puesto" : "puestos"}</span>
                        )}
                    </span>
                )}
            </span>
        </button>
    );
}

/**
 * Plano de un área. Se dibuja a escala dentro del espacio que tenga (ancho y, si lo hay,
 * alto), con las medidas en celdas de la cuadrícula: el mismo plano se ve en un TV, una
 * tablet o una computadora.
 *
 * - Vista: `cuentasPorMesa` (Map id → cuentas abiertas) y `onTap(mesa)`.
 * - Edición: `editable`, `onMove(id, {x, y})` mientras se arrastra y `onTap` para elegirla.
 */
export default function TablePlan({ tables, cuentasPorMesa, fmtTotal, editable = false, selectedId, highlightId, onTap, onMove }) {
    const caja = useRef(null);
    const [cell, setCell] = useState(0);
    const [ahora, setAhora] = useState(Date.now());
    const arrastre = useRef(null);

    useLayoutEffect(() => {
        const el = caja.current;
        if (!el) return;
        const medir = () => {
            const W = el.clientWidth, H = el.clientHeight;
            // Sin alto propio (la página se desplaza), manda el ancho.
            setCell(H > 80 ? Math.min(W / COLS, H / ROWS) : W / COLS);
        };
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    // Arrastrar mueve de a una celda. Un toque sin movimiento elige la mesa.
    const empezar = (t) => (e) => {
        if (!editable) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        arrastre.current = { id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, w: t.w, h: t.h, movio: false };
    };
    const mover = (e) => {
        const a = arrastre.current;
        if (!a || !cell) return;
        const dx = Math.round((e.clientX - a.sx) / cell);
        const dy = Math.round((e.clientY - a.sy) / cell);
        if (dx || dy) a.movio = true;
        const x = Math.min(Math.max(a.ox + dx, 0), COLS - a.w);
        const y = Math.min(Math.max(a.oy + dy, 0), ROWS - a.h);
        onMove?.(a.id, { x, y });
    };
    const soltar = () => {
        const a = arrastre.current;
        arrastre.current = null;
        if (a && !a.movio) onTap?.(tables.find(t => t.id === a.id));
    };

    const lineas = "rgba(127,127,127,0.13)";

    return (
        <div ref={caja} className="w-full h-full min-h-0 flex items-start justify-center">
            {cell > 0 && (
                <div
                    onPointerMove={editable ? mover : undefined}
                    onPointerUp={editable ? soltar : undefined}
                    onPointerCancel={editable ? () => { arrastre.current = null; } : undefined}
                    style={{
                        width: cell * COLS, height: cell * ROWS,
                        backgroundImage: editable ? `linear-gradient(to right, ${lineas} 1px, transparent 1px), linear-gradient(to bottom, ${lineas} 1px, transparent 1px)` : undefined,
                        backgroundSize: editable ? `${cell}px ${cell}px` : undefined,
                    }}
                    className="relative shrink-0 rounded-2xl bg-surface-2/50 dark:bg-white/[0.02] border border-border/60 dark:border-white/[0.06]"
                >
                    {tables.map(t => (
                        <Mesa key={t.id} t={t} cell={cell} ahora={ahora} fmtTotal={fmtTotal}
                            cuentas={cuentasPorMesa?.get(t.id) || []}
                            seleccionada={selectedId === t.id} resaltada={highlightId === t.id}
                            editable={editable}
                            onPointerDown={empezar(t)}
                            onClick={editable ? undefined : () => onTap?.(t)} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Las mismas mesas como cuadrícula de tarjetas, para el teléfono: a 390px el plano deja cada
 * mesa del tamaño de una uña.
 */
export function TableGrid({ tables, cuentasPorMesa, fmtTotal, highlightId, onTap, className = "grid grid-cols-3 gap-2" }) {
    const ahora = Date.now();
    const orden = [...tables].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
        <div className={className}>
            {orden.map(t => {
                const cuentas = cuentasPorMesa?.get(t.id) || [];
                const ocupada = cuentas.length > 0;
                const cocina = cocinaDe(cuentas);
                const abierta = ocupada ? Math.min(...cuentas.map(c => new Date(c.created_at).getTime())) : null;
                const pidio = ocupada ? pidioDesde(cuentas) : null;
                return (
                    <button key={t.id} type="button" onClick={() => onTap?.(t)}
                        className={[
                            "relative h-[76px] rounded-xl px-2 flex flex-col items-center justify-center text-center active:scale-[0.97] transition-transform",
                            ocupada
                                ? "bg-white dark:bg-white/[0.09] border-2 border-content/70 dark:border-white/55 shadow-card dark:shadow-none"
                                : "bg-white/60 dark:bg-white/[0.02] border border-dashed border-content/25 dark:border-white/20",
                            highlightId === t.id ? "ring-2 ring-brand-500" : "",
                        ].join(" ")}>
                        <span className={`text-[14px] font-semibold truncate max-w-full ${ocupada ? "text-content dark:text-white" : "text-content-subtle"}`}>{t.name}</span>
                        {ocupada ? (
                            <>
                                {fmtTotal && <span className="text-[12px] font-semibold text-content dark:text-white tabular-nums">{fmtTotal(cuentas)}</span>}
                                {pidio
                                    ? <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">Cuenta · {fmtMin(minutosDesde(pidio, ahora))}</span>
                                    : <span className="text-[11px] text-content-subtle tabular-nums">{fmtMin(minutosDesde(abierta, ahora))}</span>}
                            </>
                        ) : (
                            <span className="text-[11px] text-content-subtle">{t.seats} {t.seats === 1 ? "puesto" : "puestos"}</span>
                        )}
                        {cocina === "lista" && <MarcaLista />}
                        {pidio && <MarcaCuenta />}
                    </button>
                );
            })}
        </div>
    );
}

/** Cuentas abiertas agrupadas por mesa, desde el listado de cuentas en espera. */
export const agruparPorMesa = (cuentas) => {
    const m = new Map();
    for (const c of cuentas || []) {
        if (!c.table_id) continue;
        if (!m.has(c.table_id)) m.set(c.table_id, []);
        m.get(c.table_id).push(c);
    }
    return m;
};
