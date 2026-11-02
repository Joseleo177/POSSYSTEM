import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { resolveImageUrl, imgRetryOnError } from "../helpers";
import { Spinner } from "./ui/Spinner";
import ConfirmModal from "./ui/ConfirmModal";

const MAX_FOTOS = 12;

// Fotos adicionales de un producto, para la ficha de la vitrina. Las pidió una tienda de
// anillos, pulseras y relojes que no trabaja con variantes: los modelos comparten precio y
// existencias, así que cargan un solo producto y muestran aquí todas las piezas que entran en él.
//
// Con el producto ya guardado, cada acción se guarda al momento (subir, nombrar, ordenar,
// quitar), igual que la foto por color de las variantes: no espera al "Guardar cambios".
// Al CREAR el producto todavía no hay a dónde subirlas: se eligen igual, quedan en
// `pendientes` (las tiene el modal) y el modal las sube apenas el producto existe.
//
// `mainUrl` es la foto principal (la de arriba en la ficha). Cuando una de estas pasa a ser
// la principal, `onMainChange` le avisa al modal para que actualice la suya.
export default function ProductPhotos({ productId, mainUrl, onMainChange, notify, pendientes = [], onPendientesChange }) {
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
        return <PorSubir mainUrl={mainUrl} pendientes={pendientes} onChange={onPendientesChange} notify={notify} />;
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

// Las fotos elegidas mientras se crea el producto. Solo viven en el navegador hasta guardar:
// cada una es { file, url (vista previa), label }. Sin foto principal, la primera hará de
// principal (lo decide el modal al crear).
function PorSubir({ mainUrl, pendientes, onChange, notify }) {
    const agregar = (archivos) => {
        const lugar = MAX_FOTOS - pendientes.length;
        const lista = archivos.slice(0, Math.max(lugar, 0));
        if (archivos.length > lista.length) notify?.(`Caben ${MAX_FOTOS} fotos adicionales; se agregan las primeras ${lista.length}`, "err");
        if (!lista.length) return;
        onChange?.([...pendientes, ...lista.map(file => ({ file, url: URL.createObjectURL(file), label: "" }))]);
    };
    const cambiar = (i, label) => onChange?.(pendientes.map((p, j) => (j === i ? { ...p, label } : p)));
    const mover = (i, paso) => {
        const d = i + paso;
        if (d < 0 || d >= pendientes.length) return;
        const nuevas = [...pendientes];
        [nuevas[i], nuevas[d]] = [nuevas[d], nuevas[i]];
        onChange?.(nuevas);
    };
    const quitar = (i) => {
        URL.revokeObjectURL(pendientes[i].url);
        onChange?.(pendientes.filter((_, j) => j !== i));
    };

    return (
        <Marco total={pendientes.length}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mainUrl && (
                    <div className="min-w-0">
                        <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08]">
                            <img src={resolveImageUrl(mainUrl)} alt="Foto principal" className="w-full h-full object-cover" />
                        </div>
                        <p className="mt-1.5 text-[12px] font-medium text-content dark:text-white">Principal</p>
                        <p className="text-[12px] text-content-subtle">La de la grilla y la caja</p>
                    </div>
                )}
                {pendientes.map((p, i) => (
                    <div key={p.url} className="min-w-0">
                        <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08]">
                            <img src={p.url} alt={p.label || `Foto ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                        {!mainUrl && i === 0 ? (
                            <p className="mt-1.5 text-[12px] text-content-subtle h-9 flex items-center">Será la principal</p>
                        ) : (
                            <input
                                value={p.label}
                                onChange={e => cambiar(i, e.target.value)}
                                maxLength={60}
                                autoComplete="off"
                                placeholder="Nombre (opcional)"
                                className="input !h-9 mt-1.5"
                            />
                        )}
                        <div className="mt-1 flex items-center gap-0.5">
                            <IconBtn title="Mover antes" disabled={i === 0} onClick={() => mover(i, -1)}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </IconBtn>
                            <IconBtn title="Mover después" disabled={i === pendientes.length - 1} onClick={() => mover(i, 1)}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </IconBtn>
                            <IconBtn title="Quitar foto" tone="red" onClick={() => quitar(i)} className="ml-auto">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </IconBtn>
                        </div>
                    </div>
                ))}
                {pendientes.length < MAX_FOTOS && (
                    <label className="aspect-square rounded-xl border border-dashed border-border dark:border-white/15 bg-surface-2 dark:bg-white/[0.04] flex flex-col items-center justify-center gap-1 text-content-subtle cursor-pointer hover:border-content-subtle/60 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14M5 12h14" /></svg>
                        <span className="text-[12px] font-medium">Agregar fotos</span>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={e => { const lista = Array.from(e.target.files || []); e.target.value = ""; agregar(lista); }}
                        />
                    </label>
                )}
            </div>
            {pendientes.length > 0 && (
                <p className="mt-3 text-[12px] text-content-subtle">Se suben al crear el producto.</p>
            )}
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
