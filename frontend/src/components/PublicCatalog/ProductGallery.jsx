import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";

// Fotos de la ficha del producto en la vitrina: la principal (o la del color elegido) y las
// adicionales que la tienda cargó. En el teléfono se desliza con el dedo; al tocar la foto, o
// con la lupa de la esquina, se abre en pantalla completa con zoom para ver el detalle de la pieza.
//
// `fotos` es [{ url, label }]. El nombre ("Modelo 3") va sobre la foto para que el cliente
// sepa cómo pedirla. Con una sola foto se ve igual que antes: sin flechas ni miniaturas.
//
// Con el cursor sobre la foto, pasan solas cada PASO ms; la miniatura activa lleva una barrita
// que se llena hasta el cambio. Solo con mouse: en el teléfono el cliente desliza.
const PASO = 2800;

export default function ProductGallery({ fotos, alt, apagada = false, inicial }) {
    const [idx, setIdx] = useState(0);
    const [grande, setGrande] = useState(false);
    const [encima, setEncima] = useState(false);
    const carril = useRef(null);
    const varias = fotos.length > 1;

    // Otro color u otro producto: vuelve a la primera.
    const clave = fotos.map(f => f.url).join("|");
    useEffect(() => {
        setIdx(0);
        if (carril.current) carril.current.scrollLeft = 0;
    }, [clave]);

    const ir = useCallback((i, suave = true) => {
        const el = carril.current;
        const n = Math.max(0, Math.min(fotos.length - 1, i));
        setIdx(n);
        if (el) el.scrollTo({ left: n * el.clientWidth, behavior: suave ? "smooth" : "auto" });
    }, [fotos.length]);
    const alDeslizar = (e) => {
        const el = e.currentTarget;
        const n = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        if (n !== idx) setIdx(n);
    };

    // Cada cambio de foto (solo o a mano) vuelve a contar desde cero.
    const pasando = varias && encima && !grande;
    useEffect(() => {
        if (!pasando) return;
        const t = setTimeout(() => ir((idx + 1) % fotos.length), PASO);
        return () => clearTimeout(t);
    }, [pasando, idx, fotos.length, ir]);

    if (!fotos.length) {
        return (
            <div className={`aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] relative overflow-hidden ${apagada ? "opacity-60" : ""}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl font-black text-brand-500/25 select-none">{inicial}</span>
                </div>
            </div>
        );
    }

    const actual = fotos[idx] || fotos[0];

    return (
        // En escritorio las miniaturas van en columna a la izquierda, del alto de la foto; en
        // el teléfono, en fila debajo.
        <div className={varias ? "md:grid md:grid-cols-[76px_minmax(0,1fr)] md:gap-3" : ""}>
            <div
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setEncima(true); }}
                onPointerLeave={() => setEncima(false)}
                className={`md:col-start-2 aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] relative overflow-hidden ${apagada ? "opacity-60" : ""}`}
            >
                <div
                    ref={carril}
                    onScroll={varias ? alDeslizar : undefined}
                    className="absolute inset-0 flex overflow-x-auto scrollbar-hide snap-x snap-mandatory"
                >
                    {fotos.map((f, i) => (
                        <button
                            key={`${f.url}-${i}`}
                            type="button"
                            onClick={() => setGrande(true)}
                            aria-label="Ver la foto en grande"
                            className="relative w-full h-full shrink-0 snap-center cursor-zoom-in"
                        >
                            <img
                                src={resolveImageUrl(f.url)}
                                alt={f.label ? `${alt} · ${f.label}` : alt}
                                loading={i === 0 ? "eager" : "lazy"}
                                onError={imgRetryOnError}
                                className={`absolute inset-0 w-full h-full object-cover ${i === 0 ? "modal-in" : ""}`}
                            />
                        </button>
                    ))}
                </div>

                {actual.label && (
                    <span key={actual.label} className="pointer-events-none absolute left-3 bottom-3 max-w-[65%] truncate px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[12px] font-semibold rise-in">
                        {actual.label}
                    </span>
                )}
                {varias && (
                    <>
                        <span className="pointer-events-none absolute right-3 top-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[12px] font-semibold tabular-nums">
                            {idx + 1} / {fotos.length}
                        </span>
                        <Flecha lado="izq" oculto={idx === 0} onClick={() => ir(idx - 1)} />
                        <Flecha lado="der" oculto={idx === fotos.length - 1} onClick={() => ir(idx + 1)} />
                    </>
                )}
                {/* La lupa dice que la foto se puede ampliar; tocar la foto hace lo mismo. */}
                <button
                    type="button"
                    onClick={() => setGrande(true)}
                    aria-label="Ampliar la foto"
                    title="Ampliar"
                    className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-white/90 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center text-content dark:text-white shadow-md active:scale-95 transition-transform"
                >
                    <IconoLupa mas className="w-[18px] h-[18px]" />
                </button>
            </div>

            {varias && (
                <div className="mt-3 md:mt-0 md:col-start-1 md:row-start-1 md:relative">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide md:absolute md:inset-0 md:flex-col md:overflow-x-hidden md:overflow-y-auto">
                        {fotos.map((f, i) => (
                            <Miniatura
                                key={`${f.url}-${i}`}
                                foto={f}
                                numero={i + 1}
                                activa={i === idx}
                                avanzando={i === idx && pasando}
                                onClick={() => ir(i)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {grande && (
                <PantallaCompleta fotos={fotos} desde={idx} alt={alt} onClose={(i) => { setGrande(false); ir(i, false); }} />
            )}
        </div>
    );
}

// Miniatura con marco: la activa lleva un borde en tinta separado de la foto por un filete del
// fondo, y las demás quedan atenuadas. Mientras las fotos pasan solas, una barrita se llena.
function Miniatura({ foto, numero, activa, avanzando, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={foto.label || `Foto ${numero}`}
            aria-current={activa ? "true" : undefined}
            title={foto.label || undefined}
            className={`group/mini relative shrink-0 w-[68px] md:w-full aspect-square rounded-[14px] p-[3px] border-2 transition-colors duration-200 ${activa
                ? "border-content dark:border-white"
                : "border-transparent hover:border-border dark:hover:border-white/20"}`}
        >
            <span className="block relative w-full h-full rounded-[9px] overflow-hidden bg-surface-2 dark:bg-white/[0.04]">
                <img
                    src={resolveImageUrl(foto.url)}
                    alt=""
                    loading="lazy"
                    onError={imgRetryOnError}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${activa ? "" : "opacity-55 group-hover/mini:opacity-100"}`}
                />
                {avanzando && (
                    <span className="absolute inset-x-1.5 bottom-1.5 h-[3px] rounded-full bg-black/25 overflow-hidden">
                        <span className="block h-full rounded-full bg-white hero-progress" style={{ "--dur": `${PASO}ms` }} />
                    </span>
                )}
            </span>
        </button>
    );
}

function Flecha({ lado, oculto, onClick, oscura = false }) {
    if (oculto) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={lado === "izq" ? "Foto anterior" : "Foto siguiente"}
            className={`hidden md:flex absolute z-10 top-1/2 -translate-y-1/2 ${lado === "izq" ? "left-3" : "right-3"} items-center justify-center rounded-full backdrop-blur-sm active:scale-95 transition-[transform,background-color] ${oscura
                ? "w-12 h-12 bg-white/10 hover:bg-white/20 text-white"
                : "w-10 h-10 bg-white/90 dark:bg-black/60 text-content dark:text-white shadow-md"}`}
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={lado === "izq" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
        </button>
    );
}

function IconoLupa({ mas, className }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6.5" />
            <path strokeLinecap="round" d="M20 20l-4.2-4.2M8.5 11h5" />
            {mas && <path strokeLinecap="round" d="M11 8.5v5" />}
        </svg>
    );
}

// --- Pantalla completa -------------------------------------------------------------------
//
// Zoom para ver el detalle de la pieza:
// - Mouse: la rueda acerca y aleja sobre el punto del cursor; un clic acerca ahí (o vuelve a
//   la foto entera); con zoom, se arrastra para moverse. También los botones − y + de arriba.
// - Touchpad: el pellizco llega como rueda con ctrlKey y hace lo mismo.
// - Teléfono: doble toque o pellizco; con zoom, un dedo mueve la foto.
// - Teclado: flechas para cambiar de foto, + y − para el zoom, 0 para volver, Esc para salir.
//
// El zoom es de la foto activa y se pierde al cambiar de foto. Mientras hay zoom el carril no
// se desliza: el gesto mueve la foto en vez de pasar a la siguiente.
const ZOOM_MAX = 4;
const ZOOM_CLIC = 2.5;
const SIN_ZOOM = { s: 1, x: 0, y: 0 };
const entre = (v, a, b) => Math.min(b, Math.max(a, v));

function PantallaCompleta({ fotos, desde, alt, onClose }) {
    const [idx, setIdx] = useState(desde);
    const [z, setZ] = useState(SIN_ZOOM);
    const [arrastrando, setArrastrando] = useState(false);
    const carril = useRef(null);
    const marcos = useRef([]);
    const imgs = useRef([]);
    const idxRef = useRef(desde);
    const zRef = useRef(z);
    const punteros = useRef(new Map());
    const gesto = useRef(null);
    const ultimoToque = useRef(0);
    idxRef.current = idx;
    zRef.current = z;
    const varias = fotos.length > 1;
    const conZoom = z.s > 1;

    // Que la foto ampliada no se despegue de los bordes de su marco.
    const encajar = useCallback((s, x, y) => {
        const img = imgs.current[idxRef.current];
        const marco = marcos.current[idxRef.current];
        if (s <= 1.01 || !img || !marco) return SIN_ZOOM;
        const mx = Math.max(0, (img.offsetWidth * s - marco.clientWidth) / 2);
        const my = Math.max(0, (img.offsetHeight * s - marco.clientHeight) / 2);
        return { s, x: entre(x, -mx, mx), y: entre(y, -my, my) };
    }, []);

    // Acerca o aleja dejando quieto el punto (px, py), medido desde el centro del marco.
    const zoomA = useCallback((s2, px = 0, py = 0, base = zRef.current) => {
        const s = entre(s2, 1, ZOOM_MAX);
        setZ(encajar(s, px - (px - base.x) * s / base.s, py - (py - base.y) * s / base.s));
    }, [encajar]);

    // Los pasos de los botones y del teclado: alejar desde 166% no deja la foto en un 111%
    // que no es ni entera ni ampliada, la devuelve completa.
    const acercar = useCallback(() => zoomA(zRef.current.s * 1.5), [zoomA]);
    const alejar = useCallback(() => {
        const s = zRef.current.s / 1.5;
        if (s < 1.25) setZ(SIN_ZOOM); else zoomA(s);
    }, [zoomA]);

    const puntoEn = useCallback((cx, cy) => {
        const r = marcos.current[idxRef.current]?.getBoundingClientRect();
        return r ? [cx - r.left - r.width / 2, cy - r.top - r.height / 2] : [0, 0];
    }, []);

    const ir = useCallback((n) => {
        const el = carril.current;
        const i = entre(n, 0, fotos.length - 1);
        setZ(SIN_ZOOM);
        if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    }, [fotos.length]);

    useEffect(() => {
        const el = carril.current;
        if (el) el.scrollLeft = desde * el.clientWidth;
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const tecla = (e) => {
            if (e.key === "Escape") onClose(idxRef.current);
            else if (e.key === "ArrowLeft") ir(idxRef.current - 1);
            else if (e.key === "ArrowRight") ir(idxRef.current + 1);
            else if (e.key === "+" || e.key === "=") acercar();
            else if (e.key === "-") alejar();
            else if (e.key === "0") setZ(SIN_ZOOM);
        };
        // Con addEventListener y passive:false: React registra la rueda como pasiva y así no se
        // podría frenar el desplazamiento ni el zoom de la página entera.
        const rueda = (e) => {
            // Deslizar de lado en el touchpad pasa de foto: eso lo hace el carril.
            if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            e.preventDefault();
            const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
            const [px, py] = puntoEn(e.clientX, e.clientY);
            zoomA(zRef.current.s * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.002)), px, py);
        };
        window.addEventListener("keydown", tecla);
        el?.addEventListener("wheel", rueda, { passive: false });
        return () => {
            document.body.style.overflow = previo;
            window.removeEventListener("keydown", tecla);
            el?.removeEventListener("wheel", rueda);
        };
        // Solo al abrir: `desde` es la foto con la que se entra.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const alternar = (cx, cy) => {
        if (zRef.current.s > 1) { setZ(SIN_ZOOM); return; }
        const [px, py] = puntoEn(cx, cy);
        zoomA(ZOOM_CLIC, px, py, SIN_ZOOM);
    };
    const dosDedos = () => {
        const [a, b] = [...punteros.current.values()];
        return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: puntoEn((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
    };

    const alPresionar = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
        if (punteros.current.size === 2) {
            const { d, c } = dosDedos();
            gesto.current = { tipo: "pellizco", d0: Math.max(d, 1), c, base: zRef.current };
            setArrastrando(true);
        } else if (punteros.current.size === 1) {
            gesto.current = { tipo: "arrastre", cx: e.clientX, cy: e.clientY, base: zRef.current, movio: false };
            // Sin zoom, el dedo desliza el carril y de eso se encarga el navegador.
            if (zRef.current.s > 1 || e.pointerType === "mouse") e.currentTarget.setPointerCapture?.(e.pointerId);
        }
    };
    const alMover = (e) => {
        if (!punteros.current.has(e.pointerId)) return;
        punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
        const g = gesto.current;
        if (!g) return;
        if (g.tipo === "pellizco" && punteros.current.size === 2) {
            const { d } = dosDedos();
            zoomA(g.base.s * d / g.d0, g.c[0], g.c[1], g.base);
        } else if (g.tipo === "arrastre") {
            const dx = e.clientX - g.cx;
            const dy = e.clientY - g.cy;
            if (!g.movio && Math.hypot(dx, dy) > 5) {
                g.movio = true;
                if (g.base.s > 1) setArrastrando(true);
            }
            if (g.movio && g.base.s > 1) setZ(encajar(g.base.s, g.base.x + dx, g.base.y + dy));
        }
    };
    const alSoltar = (e) => {
        if (!punteros.current.delete(e.pointerId)) return;
        const g = gesto.current;
        // Queda un dedo del pellizco: sigue moviendo la foto desde donde está.
        if (punteros.current.size > 0) {
            const [cx, cy] = [...punteros.current.values()][0];
            gesto.current = { tipo: "arrastre", cx, cy, base: zRef.current, movio: true };
            return;
        }
        gesto.current = null;
        setArrastrando(false);
        if (e.type === "pointercancel" || g?.tipo !== "arrastre" || g.movio) return;
        // Un toque sin mover: con mouse, el clic; en el teléfono, el doble toque (uno solo no
        // hace nada, para no acercar por accidente al deslizar).
        if (e.pointerType === "mouse") { alternar(e.clientX, e.clientY); return; }
        const ahora = Date.now();
        if (ahora - ultimoToque.current < 300) {
            ultimoToque.current = 0;
            alternar(e.clientX, e.clientY);
        } else {
            ultimoToque.current = ahora;
        }
    };

    const actual = fotos[idx] || fotos[0];
    const boton = "w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none";

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none" role="dialog" aria-modal="true" aria-label={alt}>
            <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 text-white">
                <span className="text-[13px] font-semibold tabular-nums">{varias ? `${idx + 1} / ${fotos.length}` : ""}</span>
                <div className="flex items-center gap-1 -mr-2">
                    <button type="button" onClick={alejar} disabled={!conZoom} aria-label="Alejar" title="Alejar (−)" className={boton}>
                        <IconoLupa className="w-[22px] h-[22px]" />
                    </button>
                    <span className="w-12 text-center text-[12px] font-semibold tabular-nums text-white/70">{Math.round(z.s * 100)}%</span>
                    <button type="button" onClick={acercar} disabled={z.s >= ZOOM_MAX} aria-label="Acercar" title="Acercar (+)" className={boton}>
                        <IconoLupa mas className="w-[22px] h-[22px]" />
                    </button>
                    <span className="w-px h-6 bg-white/15 mx-1" />
                    <button type="button" onClick={() => onClose(idx)} aria-label="Cerrar" title="Cerrar (Esc)" className={boton}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>

            <div className="relative flex-1 min-h-0">
                <div
                    ref={carril}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        const n = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
                        if (n !== idx) { setIdx(n); setZ(SIN_ZOOM); }
                    }}
                    onPointerDown={alPresionar}
                    onPointerMove={alMover}
                    onPointerUp={alSoltar}
                    onPointerCancel={alSoltar}
                    style={{ touchAction: conZoom ? "none" : "pan-x" }}
                    className={`absolute inset-0 flex scrollbar-hide snap-x snap-mandatory ${conZoom
                        ? `overflow-hidden ${arrastrando ? "cursor-grabbing" : "cursor-grab"}`
                        : "overflow-x-auto cursor-zoom-in"}`}
                >
                    {fotos.map((f, i) => (
                        <div
                            key={`${f.url}-${i}`}
                            ref={(n) => { marcos.current[i] = n; }}
                            className="relative w-full h-full shrink-0 snap-center flex items-center justify-center p-2 overflow-hidden"
                        >
                            <img
                                ref={(n) => { imgs.current[i] = n; }}
                                src={resolveImageUrl(f.url)}
                                alt={f.label || alt}
                                onError={imgRetryOnError}
                                draggable={false}
                                style={i === idx && conZoom ? {
                                    transform: `translate3d(${z.x}px, ${z.y}px, 0) scale(${z.s})`,
                                    transition: arrastrando ? "none" : "transform .2s ease-out",
                                } : { transition: "transform .2s ease-out" }}
                                className="max-w-full max-h-full object-contain will-change-transform"
                            />
                        </div>
                    ))}
                </div>
                {varias && !conZoom && (
                    <>
                        <Flecha oscura lado="izq" oculto={idx === 0} onClick={() => ir(idx - 1)} />
                        <Flecha oscura lado="der" oculto={idx === fotos.length - 1} onClick={() => ir(idx + 1)} />
                    </>
                )}
            </div>

            <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 flex flex-col items-center gap-3 text-white">
                <div className="min-h-[22px] text-[15px] font-semibold text-center">{actual.label || ""}</div>
                {varias && (
                    <div className="flex gap-2 max-w-full overflow-x-auto scrollbar-hide">
                        {fotos.map((f, i) => (
                            <button
                                key={`${f.url}-${i}`}
                                type="button"
                                onClick={() => ir(i)}
                                aria-label={f.label || `Foto ${i + 1}`}
                                aria-current={i === idx ? "true" : undefined}
                                className={`relative w-14 h-14 shrink-0 rounded-xl p-[2px] border-2 transition ${i === idx ? "border-white" : "border-transparent opacity-50 hover:opacity-100"}`}
                            >
                                <span className="block relative w-full h-full rounded-[8px] overflow-hidden bg-white/5">
                                    <img src={resolveImageUrl(f.url)} alt="" loading="lazy" onError={imgRetryOnError} className="absolute inset-0 w-full h-full object-cover" />
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                <p className="text-[12px] text-white/45 text-center">
                    <span className="hidden [@media(hover:hover)]:inline">Rueda o clic para acercar · arrastra para moverte</span>
                    <span className="[@media(hover:hover)]:hidden">Toca dos veces o pellizca para acercar</span>
                </p>
            </div>
        </div>,
        document.body
    );
}
