import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";

// Fotos de la ficha del producto en la vitrina: la principal (o la del color elegido) y las
// adicionales que la tienda cargó. En el teléfono se desliza con el dedo; debajo van las
// miniaturas y, al tocar la foto, se abre en pantalla completa para ver el detalle de la pieza.
//
// `fotos` es [{ url, label }]. El nombre ("Modelo 3") va sobre la foto para que el cliente
// sepa cómo pedirla. Con una sola foto se ve igual que antes: sin flechas ni miniaturas.
export default function ProductGallery({ fotos, alt, apagada = false, inicial }) {
    const [idx, setIdx] = useState(0);
    const [grande, setGrande] = useState(false);
    const carril = useRef(null);
    const varias = fotos.length > 1;

    // Otro color u otro producto: vuelve a la primera.
    const clave = fotos.map(f => f.url).join("|");
    useEffect(() => {
        setIdx(0);
        if (carril.current) carril.current.scrollLeft = 0;
    }, [clave]);

    const ir = (i, suave = true) => {
        const el = carril.current;
        const n = Math.max(0, Math.min(fotos.length - 1, i));
        setIdx(n);
        if (el) el.scrollTo({ left: n * el.clientWidth, behavior: suave ? "smooth" : "auto" });
    };
    const alDeslizar = (e) => {
        const el = e.currentTarget;
        const n = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        if (n !== idx) setIdx(n);
    };

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
        <div>
            <div className={`aspect-square rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/40 dark:border-white/[0.06] relative overflow-hidden ${apagada ? "opacity-60" : ""}`}>
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
                    <span className="pointer-events-none absolute left-3 bottom-3 max-w-[70%] truncate px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[12px] font-semibold">
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
            </div>

            {varias && (
                <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {fotos.map((f, i) => (
                        <button
                            key={`${f.url}-${i}`}
                            type="button"
                            onClick={() => ir(i)}
                            aria-label={f.label || `Foto ${i + 1}`}
                            className={`relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${i === idx
                                ? "border-brand-500"
                                : "border-transparent opacity-70 hover:opacity-100"}`}
                        >
                            <img src={resolveImageUrl(f.url)} alt="" loading="lazy" onError={imgRetryOnError} className="absolute inset-0 w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}

            {grande && (
                <PantallaCompleta fotos={fotos} desde={idx} alt={alt} onClose={(i) => { setGrande(false); ir(i, false); }} />
            )}
        </div>
    );
}

function Flecha({ lado, oculto, onClick }) {
    if (oculto) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={lado === "izq" ? "Foto anterior" : "Foto siguiente"}
            className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${lado === "izq" ? "left-3" : "right-3"} w-10 h-10 rounded-full bg-white/90 dark:bg-black/60 backdrop-blur-sm items-center justify-center text-content dark:text-white shadow-md active:scale-95 transition-transform`}
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={lado === "izq" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
        </button>
    );
}

// La foto en grande, sobre todo lo demás. Se desliza igual que la de la ficha, se cierra con
// la X, con Esc o con "atrás" del teclado, y al cerrar la ficha queda en la misma foto.
function PantallaCompleta({ fotos, desde, alt, onClose }) {
    const [idx, setIdx] = useState(desde);
    const carril = useRef(null);
    const idxRef = useRef(desde);
    idxRef.current = idx;

    useEffect(() => {
        const el = carril.current;
        if (el) el.scrollLeft = desde * el.clientWidth;
        const previo = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const tecla = (e) => {
            if (e.key === "Escape") onClose(idxRef.current);
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const n = Math.max(0, Math.min(fotos.length - 1, idxRef.current + (e.key === "ArrowLeft" ? -1 : 1)));
                if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
            }
        };
        window.addEventListener("keydown", tecla);
        return () => { document.body.style.overflow = previo; window.removeEventListener("keydown", tecla); };
        // Solo al abrir: `desde` es la foto con la que se entra.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const actual = fotos[idx] || fotos[0];

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={alt}>
            <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 text-white">
                <span className="text-[13px] font-semibold tabular-nums">{fotos.length > 1 ? `${idx + 1} / ${fotos.length}` : ""}</span>
                <button
                    type="button"
                    onClick={() => onClose(idx)}
                    aria-label="Cerrar"
                    className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div
                ref={carril}
                onScroll={(e) => {
                    const el = e.currentTarget;
                    const n = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
                    if (n !== idx) setIdx(n);
                }}
                className="flex-1 min-h-0 flex overflow-x-auto scrollbar-hide snap-x snap-mandatory"
            >
                {fotos.map((f, i) => (
                    <div key={`${f.url}-${i}`} className="relative w-full h-full shrink-0 snap-center flex items-center justify-center p-2">
                        <img src={resolveImageUrl(f.url)} alt={f.label || alt} onError={imgRetryOnError} className="max-w-full max-h-full object-contain select-none" draggable={false} />
                    </div>
                ))}
            </div>
            <div className="min-h-[56px] px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2 text-center text-white text-[15px] font-semibold">
                {actual.label || ""}
            </div>
        </div>,
        document.body
    );
}
