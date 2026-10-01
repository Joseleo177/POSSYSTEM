import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../services/api";
import CustomSelect from "./ui/CustomSelect";
import { Spinner } from "./ui/Spinner";
import { resolveImageUrl, imgRetryOnError } from "../helpers/image";

// Plantillas para arrancar sin teclear talla por talla. Se crean como atributos de la empresa
// la primera vez que se usan; después aparecen en la lista como cualquier otro.
const PLANTILLAS = [
    { name: "Talla", values: ["XS", "S", "M", "L", "XL", "XXL"] },
    { name: "Talla calzado", values: ["34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
    { name: "Color", values: ["Negro", "Blanco", "Gris", "Azul", "Rojo"] },
];

// Más de esto ya no es una matriz que alguien revise fila por fila.
const MAX_VARIANTES = 300;

// Misma clave que el servidor (variant_key): ids de los valores, ordenados.
const claveDe = (valueIds) => Object.values(valueIds).map(Number).sort((a, b) => a - b).join("-");

// Producto cartesiano en el orden de los atributos: Color × Talla → Negro/S, Negro/M, …
function combinar(listas) {
    return listas.reduce((acc, lista) => acc.flatMap(prev => lista.map(v => [...prev, v])), [[]]);
}

// Editor de la pestaña Variantes. Guarda en el padre, vía onChange, lo que el servidor espera:
// { attribute_ids, variants: [{ id?, value_ids, barcode, price, own_price }] }.
//
// La lista de variantes es siempre la combinación de los valores marcados; lo que se quiere
// fuera (no hay Blanco en XXL) se quita fila por fila.
export default function VariantsEditor({ productId, modelPrice, onChange, notify, warehouseId }) {
    const [catalogo, setCatalogo] = useState([]);       // todos los atributos de la empresa
    const [attrIds, setAttrIds] = useState([]);          // los de este producto, en orden
    const [marcados, setMarcados] = useState({});        // attrId -> [valueIds]
    const [filas, setFilas] = useState({});              // clave -> { id, barcode, price, own_price, qty }
    const [quitadas, setQuitadas] = useState(() => new Set());
    const [cargando, setCargando] = useState(true);
    const [nuevoAttr, setNuevoAttr] = useState(null);    // null | "" (tecleando un nombre)
    const [ocupado, setOcupado] = useState(false);
    const [fotos, setFotos] = useState({});              // valueId -> url de la foto de ese color
    const [subiendo, setSubiendo] = useState(null);      // valueId que se está subiendo
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const [attrs, actual] = await Promise.all([
                    api.productAttributes.getAll(),
                    productId ? api.products.variants(productId, warehouseId ? { warehouse_id: warehouseId } : {}) : Promise.resolve(null),
                ]);
                if (!vivo) return;
                setCatalogo(attrs.data || []);
                if (actual?.data) {
                    const { attributes, variants } = actual.data;
                    setAttrIds(attributes.map(a => a.id));
                    setMarcados(Object.fromEntries(attributes.map(a => [a.id, a.values.map(v => v.id)])));
                    const filasIni = Object.fromEntries(variants.map(v => [claveDe(v.value_ids), {
                        id: v.id, barcode: v.barcode || "", own_price: v.own_price,
                        price: v.own_price ? String(v.price) : "", qty: v.qty, value_ids: v.value_ids,
                    }]));
                    // Foto de cada valor: la de cualquiera de sus variantes (se suben juntas).
                    const fotosIni = {};
                    for (const v of variants) {
                        if (!v.image_url) continue;
                        for (const vid of Object.values(v.value_ids)) fotosIni[vid] ??= v.image_url;
                    }
                    setFotos(fotosIni);
                    setFilas(filasIni);
                    // Las combinaciones que el modelo no tiene (no hay Blanco en XL) arrancan
                    // quitadas. Si no, abrir la ficha y guardar sin mirar crearía variantes
                    // que nadie pidió.
                    const faltan = combinar(attributes.map(a => a.values))
                        .map(vals => claveDe(Object.fromEntries(vals.map((v, i) => [attributes[i].id, v.id]))))
                        .filter(k => !filasIni[k]);
                    setQuitadas(new Set(faltan));
                }
            } catch (e) { notify?.(e.message, "err"); }
            finally { if (vivo) setCargando(false); }
        })();
        return () => { vivo = false; };
    }, [productId]); // eslint-disable-line

    const attrPorId = useMemo(() => new Map(catalogo.map(a => [a.id, a])), [catalogo]);
    const elegidos = attrIds.map(id => attrPorId.get(id)).filter(Boolean);

    // Las combinaciones que salen de lo marcado, en el orden de los atributos y sus valores.
    const combinaciones = useMemo(() => {
        if (!elegidos.length) return [];
        const listas = elegidos.map(a => a.values.filter(v => (marcados[a.id] || []).includes(v.id)));
        if (listas.some(l => !l.length)) return [];
        return combinar(listas).map(vals => {
            const value_ids = Object.fromEntries(vals.map((v, i) => [elegidos[i].id, v.id]));
            return { clave: claveDe(value_ids), value_ids, label: vals.map(v => v.value).join(" / ") };
        });
    }, [elegidos, marcados]); // eslint-disable-line

    // Lo que se manda al guardar. Se avisa al padre cada vez que cambia.
    useEffect(() => {
        if (cargando) return;
        const variants = combinaciones
            .filter(c => !quitadas.has(c.clave))
            .map(c => {
                const f = filas[c.clave] || {};
                const price = String(f.price ?? "").trim();
                return { ...(f.id ? { id: f.id } : {}), value_ids: c.value_ids, barcode: (f.barcode || "").trim(), own_price: price !== "", price: price || null };
            });
        onChangeRef.current({ attribute_ids: attrIds, variants });
    }, [combinaciones, filas, quitadas, attrIds, cargando]);

    const recargarCatalogo = (r) => setCatalogo(r.data || []);

    const agregarAtributo = (id) => {
        const n = parseInt(id, 10);
        if (!n || attrIds.includes(n)) return;
        setAttrIds(prev => [...prev, n]);
    };

    const crearAtributo = async (name, values = []) => {
        const nombre = name.trim();
        if (!nombre) return;
        const existente = catalogo.find(a => a.name.toLowerCase() === nombre.toLowerCase());
        if (existente) { agregarAtributo(existente.id); setNuevoAttr(null); return; }
        setOcupado(true);
        try {
            const r = await api.productAttributes.create(nombre, values);
            recargarCatalogo(r);
            const creado = (r.data || []).find(a => a.name.toLowerCase() === nombre.toLowerCase());
            if (creado) {
                setAttrIds(prev => [...prev, creado.id]);
                // Una plantilla llega con todos sus valores marcados; se desmarca lo que sobre.
                setMarcados(prev => ({ ...prev, [creado.id]: creado.values.map(v => v.id) }));
            }
            setNuevoAttr(null);
        } catch (e) { notify?.(e.message, "err"); }
        finally { setOcupado(false); }
    };

    const quitarAtributo = (id) => {
        setAttrIds(prev => prev.filter(x => x !== id));
        setMarcados(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const alternarValor = (attrId, valueId) => setMarcados(prev => {
        const actual = prev[attrId] || [];
        return { ...prev, [attrId]: actual.includes(valueId) ? actual.filter(v => v !== valueId) : [...actual, valueId] };
    });

    const agregarValor = async (attrId, texto) => {
        const value = texto.trim();
        if (!value) return;
        const attr = attrPorId.get(attrId);
        const yaEsta = attr?.values.find(v => v.value.toLowerCase() === value.toLowerCase());
        if (yaEsta) {
            setMarcados(prev => ({ ...prev, [attrId]: [...new Set([...(prev[attrId] || []), yaEsta.id])] }));
            return;
        }
        try {
            const r = await api.productAttributes.addValues(attrId, [value]);
            recargarCatalogo(r);
            const nuevo = (r.data || []).find(a => a.id === attrId)?.values.find(v => v.value.toLowerCase() === value.toLowerCase());
            if (nuevo) setMarcados(prev => ({ ...prev, [attrId]: [...(prev[attrId] || []), nuevo.id] }));
        } catch (e) { notify?.(e.message, "err"); }
    };

    const setFila = (clave, campo, valor) =>
        setFilas(prev => ({ ...prev, [clave]: { ...(prev[clave] || {}), [campo]: valor } }));

    const alternarQuitada = (clave) => setQuitadas(prev => {
        const n = new Set(prev);
        n.has(clave) ? n.delete(clave) : n.add(clave);
        return n;
    });

    // La foto va por color: Negro/S, Negro/M y Negro/L se ven iguales. Sin un atributo que se
    // llame así, se usa el primero.
    const attrFoto = elegidos.find(a => /colou?r/i.test(a.name)) || elegidos[0] || null;
    // Solo se le sube foto a un valor que ya tiene variantes guardadas: la foto vive en ellas.
    const valoresConVariante = new Set(Object.values(filas).filter(f => f.id && f.value_ids).map(f => f.value_ids[attrFoto?.id]));

    const subirFoto = async (valueId, archivo) => {
        if (!productId) return;
        setSubiendo(valueId);
        try {
            const r = await api.products.setVariantImage(productId, valueId, archivo || null);
            setFotos(prev => ({ ...prev, [valueId]: r.data?.image_url || null }));
        } catch (e) { notify?.(e.message, "err"); }
        finally { setSubiendo(null); }
    };

    if (cargando) {
        return (
            <div className="py-10 flex justify-center text-content-subtle"><Spinner className="h-5 w-5" /></div>
        );
    }

    const disponibles = catalogo.filter(a => !attrIds.includes(a.id));
    const plantillasLibres = PLANTILLAS.filter(p => !catalogo.some(a => a.name.toLowerCase() === p.name.toLowerCase()));
    const activas = combinaciones.filter(c => !quitadas.has(c.clave)).length;

    return (
        <div className="space-y-3">
            {/* ── Atributos y sus valores ── */}
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                {elegidos.map(attr => (
                    <div key={attr.id} className="p-4">
                        <div className="flex items-center justify-between gap-3 mb-2.5">
                            <h3 className="text-[13px] font-semibold text-content dark:text-white">{attr.name}</h3>
                            <button type="button" onClick={() => quitarAtributo(attr.id)}
                                className="h-8 px-2 -mr-2 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                                Quitar
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {attr.values.map(v => {
                                const on = (marcados[attr.id] || []).includes(v.id);
                                return (
                                    <button key={v.id} type="button" onClick={() => alternarValor(attr.id, v.id)} aria-pressed={on}
                                        className={`h-9 sm:h-8 min-w-[40px] px-3 rounded-lg border text-[13px] font-medium transition-colors ${on
                                            ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                                            : "border-border dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                        {v.value}
                                    </button>
                                );
                            })}
                            <NuevoValor onAdd={(t) => agregarValor(attr.id, t)} />
                        </div>
                    </div>
                ))}

                {/* Agregar otro atributo */}
                <div className="p-4 space-y-3">
                    {nuevoAttr === null ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                            {disponibles.length > 0 && (
                                <div className="sm:w-56">
                                    <CustomSelect
                                        value=""
                                        onChange={agregarAtributo}
                                        options={disponibles.map(a => ({ value: String(a.id), label: a.name }))}
                                        placeholder="Agregar atributo"
                                        className="w-full"
                                    />
                                </div>
                            )}
                            <button type="button" onClick={() => setNuevoAttr("")}
                                className="h-10 px-3.5 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                Nuevo atributo
                            </button>
                        </div>
                    ) : (
                        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); crearAtributo(nuevoAttr); }}>
                            <input value={nuevoAttr} onChange={e => setNuevoAttr(e.target.value)} data-autofocus autoFocus maxLength={40}
                                autoComplete="off" className="input flex-1" placeholder="Ej. Talla, Color, Material" />
                            <button type="submit" disabled={ocupado || !nuevoAttr.trim()}
                                className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-50">
                                {ocupado && <Spinner />} Crear
                            </button>
                            <button type="button" onClick={() => setNuevoAttr(null)}
                                className="h-10 px-2 text-[13px] text-content-subtle hover:text-content dark:hover:text-white">
                                Cancelar
                            </button>
                        </form>
                    )}

                    {plantillasLibres.length > 0 && nuevoAttr === null && (
                        <div>
                            <p className="text-[12px] text-content-subtle mb-1.5">Empieza con una plantilla</p>
                            <div className="flex flex-wrap gap-1.5">
                                {plantillasLibres.map(p => (
                                    <button key={p.name} type="button" disabled={ocupado} onClick={() => crearAtributo(p.name, p.values)}
                                        className="h-9 sm:h-8 px-3 rounded-lg bg-surface-2 dark:bg-white/[0.06] text-[12px] font-medium text-content dark:text-white hover:bg-surface-3 dark:hover:bg-white/10 disabled:opacity-50 transition-colors">
                                        {p.name} <span className="text-content-subtle font-normal">· {p.values[0]}–{p.values[p.values.length - 1]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Fotos por color ── */}
            {attrFoto && (marcados[attrFoto.id] || []).length > 0 && (
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] p-4">
                    <div className="flex items-baseline justify-between gap-3 mb-3">
                        <h3 className="text-[13px] font-semibold text-content dark:text-white">Fotos por {attrFoto.name.toLowerCase()}</h3>
                        <p className="text-[12px] text-content-subtle text-right">Sin foto, se muestra la del producto</p>
                    </div>
                    {!productId ? (
                        <p className="text-[12px] text-content-subtle">Guarda el producto y vuelve a abrirlo para subir una foto por {attrFoto.name.toLowerCase()}.</p>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {attrFoto.values.filter(v => (marcados[attrFoto.id] || []).includes(v.id)).map(v => {
                                const url = fotos[v.id];
                                const guardado = valoresConVariante.has(v.id);
                                return (
                                    <div key={v.id} className="w-[72px] flex flex-col items-center gap-1">
                                        <label className={`relative w-[72px] h-[72px] rounded-xl overflow-hidden border border-dashed flex items-center justify-center ${guardado
                                            ? "cursor-pointer border-border dark:border-white/15 hover:border-content-subtle/60 bg-surface-2 dark:bg-white/[0.04]"
                                            : "border-border/50 dark:border-white/10 opacity-50 cursor-not-allowed"}`}
                                            title={guardado ? (url ? "Cambiar foto" : "Subir foto") : "Guarda las variantes primero"}>
                                            {url ? (
                                                <img src={resolveImageUrl(url)} alt={v.value} onError={imgRetryOnError} className="w-full h-full object-cover" />
                                            ) : (
                                                <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                            )}
                                            {subiendo === v.id && (
                                                <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white"><Spinner /></span>
                                            )}
                                            <input type="file" accept="image/*" className="hidden" disabled={!guardado || subiendo !== null}
                                                onChange={e => { const a = e.target.files?.[0]; e.target.value = ""; if (a) subirFoto(v.id, a); }} />
                                        </label>
                                        <span className="text-[12px] font-medium text-content dark:text-white truncate max-w-full">{v.value}</span>
                                        {url && (
                                            <button type="button" onClick={() => subirFoto(v.id, null)} disabled={subiendo !== null}
                                                className="h-7 px-1.5 -mt-1 rounded-md text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Variantes que salen de la combinación ── */}
            {combinaciones.length > 0 && (
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                    <div className="px-4 py-3 flex items-baseline justify-between gap-3 border-b border-border/60 dark:border-white/[0.06]">
                        <h3 className="text-[13px] font-semibold text-content dark:text-white">
                            {activas} {activas === 1 ? "variante" : "variantes"}
                        </h3>
                        <p className="text-[12px] text-content-subtle text-right">
                            Sin precio propio, cada una vende a Ref. {parseFloat(modelPrice || 0).toFixed(2)}
                        </p>
                    </div>
                    {combinaciones.length > MAX_VARIANTES ? (
                        <p className="px-4 py-6 text-[13px] text-red-600 dark:text-red-400">
                            Son {combinaciones.length} combinaciones. Desmarca valores para quedar por debajo de {MAX_VARIANTES}.
                        </p>
                    ) : (
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_170px_130px_72px] gap-3 px-4 py-2 text-[12px] text-content-subtle">
                                <span>Variante</span>
                                <span>Código de barras</span>
                                <span>Precio propio</span>
                                <span />
                            </div>
                            {combinaciones.map(c => {
                                const f = filas[c.clave] || {};
                                const fuera = quitadas.has(c.clave);
                                return (
                                    <div key={c.clave} className={`grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_170px_130px_72px] gap-x-3 gap-y-2 px-4 py-2.5 items-center ${fuera ? "opacity-50" : ""}`}>
                                        <div className="col-span-1 min-w-0">
                                            <p className={`text-[13px] font-medium text-content dark:text-white truncate ${fuera ? "line-through" : ""}`}>{c.label}</p>
                                            <p className="text-[11px] text-content-subtle">
                                                {f.id ? `Existencia: ${parseFloat(f.qty || 0)}` : "Nueva"}
                                            </p>
                                        </div>
                                        <div className="col-span-1 flex justify-end sm:order-last">
                                            <button type="button" onClick={() => alternarQuitada(c.clave)}
                                                className="h-9 sm:h-8 px-2 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                                                {fuera ? "Restaurar" : "Quitar"}
                                            </button>
                                        </div>
                                        <input value={f.barcode || ""} onChange={e => setFila(c.clave, "barcode", e.target.value)} disabled={fuera}
                                            inputMode="numeric" autoComplete="off" maxLength={50}
                                            className="input !h-9 tabular-nums" placeholder="Código" aria-label={`Código de barras de ${c.label}`} />
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-[12px] font-medium">$</span>
                                            <input value={f.price ?? ""} onChange={e => setFila(c.clave, "price", e.target.value.replace(/[^0-9.]/g, ""))} disabled={fuera}
                                                inputMode="decimal" autoComplete="off"
                                                className="input !h-9 !pl-7 tabular-nums" placeholder={parseFloat(modelPrice || 0).toFixed(2)} aria-label={`Precio de ${c.label}`} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {elegidos.length > 0 && combinaciones.length === 0 && (
                <p className="text-[12px] text-content-subtle text-center py-2">Marca al menos un valor en cada atributo para armar las variantes.</p>
            )}
        </div>
    );
}

// Chip para sumar un valor que todavía no existe ("XXXL", "Vinotinto"). Enter lo crea.
function NuevoValor({ onAdd }) {
    const [abierto, setAbierto] = useState(false);
    const [texto, setTexto] = useState("");
    if (!abierto) {
        return (
            <button type="button" onClick={() => setAbierto(true)}
                className="h-9 sm:h-8 px-3 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white inline-flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Valor
            </button>
        );
    }
    const cerrar = () => { setAbierto(false); setTexto(""); };
    return (
        <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); onAdd(texto); setTexto(""); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
            }}
            onBlur={() => { if (texto.trim()) onAdd(texto); cerrar(); }}
            autoFocus maxLength={40} autoComplete="off"
            className="h-9 sm:h-8 w-28 px-2.5 rounded-lg border border-brand-500 bg-white dark:bg-white/[0.04] text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="Nuevo valor"
        />
    );
}
