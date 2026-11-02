import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { resolveImageUrl, imgRetryOnError } from "../helpers";
import { Spinner } from "./ui/Spinner";
import ConfirmModal from "./ui/ConfirmModal";

const MAX_FOTOS = 12;

// Fotos adicionales de un producto, para la ficha de la vitrina. Las pidió una tienda de
// anillos, pulseras y relojes que no trabaja con variantes: los modelos comparten precio y
// existencias, así que
// cargan un solo producto y muestran aquí todas las piezas que entran en él.
//
// Cada acción se guarda al momento (subir, nombrar, ordenar, quitar), igual que la foto por
// color de las variantes: no espera al "Guardar cambios" de la ficha. Por eso el producto
// tiene que existir: al crearlo se avisa que vuelva a abrirlo.
//
// `mainUrl` es la foto principal (la de arriba en la ficha). Cuando una de estas pasa a ser
// la principal, `onMainChange` le avisa al modal para que actualice la suya.
export default function ProductPhotos({ productId, mainUrl, onMainChange, notify }) {
    const [fotos, setFotos] = useState([]);
    const [cargando, setCargando] = useState(true);
    // Cuántas se están subiendo todavía: una casilla con spinner por cada una.
    const [subiendo, setSubiendo] = useState(0);
    // Id de la foto con una acción en curso (principal, mover, quitar).
    const [ocupada, setOcupada] = useState(null);
    const [porQuitar, setPorQuitar] = useState(null);
    // En una ref: si notify cambia de identidad en cada render, como dependencia de cargar
    // volvería a pedir la lista sin parar.
    const avisoRef = useRef(notify);
    avisoRef.current = notify;

    const cargar = useCallback(async () => {
        if (!productId) return;
        try {
            const r = await api.products.images.list(productId);
            setFotos(r.data || []);
        } catch (e) { avisoRef.current?.(e.message, "err"); }
        finally { setCargando(false); }
    }, [productId]);

    useEffect(() => { cargar(); }, [cargar]);

    if (!productId) {
        return (
            <Marco total={null}>
                <p className="text-[12px] text-content-subtle">
                    Crea el producto y vuelve a abrirlo para agregar más fotos: los demás modelos, otros ángulos o la pieza puesta.
                </p>
            </Marco>
        );
    }

    // Una por una y en orden: varias juntas en una sola petición pasarían el tope de Vercel, y
    // en paralelo llegarían desordenadas.
    const subir = async (archivos) => {
        const lugar = MAX_FOTOS - fotos.length;
        const lista = archivos.slice(0, Math.max(lugar, 0));
        if (archivos.length > lista.length) notify?.(`Caben ${MAX_FOTOS} fotos adicionales; se suben las primeras ${lista.length}`, "err");
        if (!lista.length) return;
        setSubiendo(lista.length);
        for (const archivo of lista) {
            try {
                const r = await api.products.images.add(productId, archivo);
                if (r.data?.principal) onMainChange?.(r.data.image_url);
                else if (r.data?.image) setFotos(prev => [...prev, r.data.image]);
            } catch (e) {
                notify?.(e.message, "err");
            } finally {
                setSubiendo(n => n - 1);
            }
        }
    };

    const renombrar = async (foto, texto) => {
        const label = texto.trim();
        if ((foto.label || "") === label) return;
        setFotos(prev => prev.map(f => (f.id === foto.id ? { ...f, label } : f)));
        try { await api.products.images.rename(productId, foto.id, label); }
        catch (e) { notify?.(e.message, "err"); cargar(); }
    };

    const mover = async (idx, paso) => {
        const destino = idx + paso;
        if (destino < 0 || destino >= fotos.length) return;
        const nuevas = [...fotos];
        [nuevas[idx], nuevas[destino]] = [nuevas[destino], nuevas[idx]];
        setFotos(nuevas);
        setOcupada(fotos[idx].id);
        try { await api.products.images.order(productId, nuevas.map(f => f.id)); }
        catch (e) { notify?.(e.message, "err"); cargar(); }
        finally { setOcupada(null); }
    };

    const hacerPrincipal = async (foto) => {
        setOcupada(foto.id);
        try {
            const r = await api.products.images.principal(productId, foto.id);
            onMainChange?.(r.data?.image_url || null);
            await cargar();
        } catch (e) { notify?.(e.message, "err"); }
        finally { setOcupada(null); }
    };

    const quitar = async () => {
        const foto = porQuitar;
        try {
            await api.products.images.remove(productId, foto.id);
            setFotos(prev => prev.filter(f => f.id !== foto.id));
            setPorQuitar(null);
        } catch (e) { notify?.(e.message, "err"); }
    };

    const caben = fotos.length + subiendo < MAX_FOTOS;
    const libre = subiendo === 0 && ocupada === null;

    return (
        <Marco total={cargando ? null : fotos.length}>
            {cargando ? (
                <div className="py-6 flex justify-center text-content-subtle"><Spinner className="h-5 w-5" /></div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* La principal, solo para ubicarse: se cambia con la foto de arriba o
                        eligiendo otra como principal. */}
                    {mainUrl && (
                        <div className="min-w-0">
                            <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08]">
                                <img src={resolveImageUrl(mainUrl)} alt="Foto principal" loading="lazy" onError={imgRetryOnError} className="w-full h-full object-cover" />
                            </div>
                            <p className="mt-1.5 text-[12px] font-medium text-content dark:text-white">Principal</p>
                            <p className="text-[12px] text-content-subtle">La de la grilla y la caja</p>
                        </div>
                    )}

                    {fotos.map((f, i) => (
                        <div key={f.id} className="min-w-0">
                            <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08]">
                                <img src={resolveImageUrl(f.image_url)} alt={f.label || `Foto ${i + 1}`} loading="lazy" onError={imgRetryOnError} className="w-full h-full object-cover" />
                                {ocupada === f.id && (
                                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white"><Spinner /></span>
                                )}
                            </div>
                            <input
                                defaultValue={f.label || ""}
                                key={`${f.id}-${f.label || ""}`}
                                onBlur={e => renombrar(f, e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                maxLength={60}
                                autoComplete="off"
                                placeholder="Nombre (opcional)"
                                className="input !h-9 mt-1.5"
                            />
                            {/* Acciones siempre a la vista: en tablet no hay hover. */}
                            <div className="mt-1 flex items-center gap-0.5">
                                <IconBtn title="Mover antes" disabled={!libre || i === 0} onClick={() => mover(i, -1)}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </IconBtn>
                                <IconBtn title="Mover después" disabled={!libre || i === fotos.length - 1} onClick={() => mover(i, 1)}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </IconBtn>
                                <IconBtn title="Quitar foto" tone="red" disabled={!libre} onClick={() => setPorQuitar(f)} className="ml-auto">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                                </IconBtn>
                            </div>
                            {/* En su propia línea: junto a las flechas y la papelera no cabía en
                                una casilla de teléfono (dos por fila). */}
                            <button
                                type="button"
                                disabled={!libre}
                                onClick={() => hacerPrincipal(f)}
                                className="h-9 -ml-2 px-2 rounded-lg text-[12px] font-medium text-content-muted dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/[0.06] disabled:opacity-40 whitespace-nowrap"
                            >
                                Usar como principal
                            </button>
                        </div>
                    ))}

                    {Array.from({ length: subiendo }).map((_, i) => (
                        <div key={`sub-${i}`} className="aspect-square rounded-xl bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08] flex items-center justify-center text-content-subtle">
                            <Spinner className="h-5 w-5" />
                        </div>
                    ))}

                    {caben && (
                        <label className={`aspect-square rounded-xl border border-dashed border-border dark:border-white/15 bg-surface-2 dark:bg-white/[0.04] flex flex-col items-center justify-center gap-1 text-content-subtle transition-colors ${subiendo ? "opacity-50 cursor-wait" : "cursor-pointer hover:border-content-subtle/60"}`}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14M5 12h14" /></svg>
                            <span className="text-[12px] font-medium">Agregar fotos</span>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={subiendo > 0}
                                onChange={e => { const lista = Array.from(e.target.files || []); e.target.value = ""; subir(lista); }}
                            />
                        </label>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!porQuitar}
                title="Quitar foto"
                message="La foto se borra de la ficha del producto en la vitrina."
                confirmText="Quitar"
                onConfirm={quitar}
                onCancel={() => setPorQuitar(null)}
            />
        </Marco>
    );
}

function Marco({ total, children }) {
    return (
        // Sin marco propio: va dentro del recuadro de la pestaña Vitrina, junto a la marca y la
        // descripción, y un segundo borde lo dejaba como caja dentro de caja.
        <div className="pb-1">
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <h3 className="text-[13px] font-semibold text-content dark:text-white">Más fotos</h3>
                {total !== null && <p className="text-[12px] text-content-subtle">{total} de {MAX_FOTOS}</p>}
            </div>
            <p className="text-[12px] text-content-subtle -mt-2 mb-3">
                Se ven en la ficha del producto en la vitrina. Ponle nombre a cada una si el cliente debe decir cuál quiere.
            </p>
            {children}
        </div>
    );
}

function IconBtn({ title, tone, className = "", children, ...props }) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center disabled:opacity-40 transition-colors ${tone === "red"
                ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                : "text-content-muted dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/[0.06]"} ${className}`}
            {...props}
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">{children}</svg>
        </button>
    );
}
