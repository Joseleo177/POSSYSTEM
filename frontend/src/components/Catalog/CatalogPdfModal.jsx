import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Check from "../ui/Check";
import Segmented from "../ui/Segmented";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { contarPaginas, imprimirCatalogo } from "../../helpers/catalogPdf";

// Catálogo en PDF para mayoristas. Se traen los datos una sola vez al abrir (una petición:
// ver services/products/catalogPdf.js en el backend) y todo lo demás —qué líneas, qué hacer
// con los productos sin precio al mayor— se filtra aquí, sin volver a pedir nada.
//
// El PDF lo hace el navegador: se abre el diálogo de impresión con la hoja apaisada y ahí se
// elige "Guardar como PDF".

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaHoy = () => { const d = new Date(); return `${MESES[d.getMonth()].replace(/^./, c => c.toUpperCase())} ${d.getFullYear()}`; };

// Lo que se eligió la última vez: quien reparte el catálogo cada mes no debería volver a
// escribir las condiciones ni el descuento. Solo preferencias de este navegador.
const PREF = "catalogo_pdf_prefs";
const leerPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || "{}"); } catch { return {}; } };

export default function CatalogPdfModal({ open, onClose }) {
    const { notify, company, baseCurrency } = useApp();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [lineas, setLineas] = useState(null);           // ids marcados; null = todas
    const [titulo, setTitulo] = useState("Catálogo de productos");
    const [condiciones, setCondiciones] = useState("");
    const [sinPrecio, setSinPrecio] = useState("descuento");
    // Qué precio sale: el al mayor o el detal de siempre (quien todavía no cargó precios al
    // mayor igual puede repartir su catálogo con precios).
    const [modoPrecio, setModoPrecio] = useState("mayor");
    const [descuento, setDescuento] = useState("");
    const [soloPublicados, setSoloPublicados] = useState(false);
    const [fichas, setFichas] = useState(true);
    const [lista, setLista] = useState(true);
    const [mostrarDetal, setMostrarDetal] = useState(false);

    useEffect(() => {
        if (!open) return;
        const p = leerPrefs();
        if (p.titulo) setTitulo(p.titulo);
        if (p.condiciones != null) setCondiciones(p.condiciones);
        if (p.sinPrecio) setSinPrecio(p.sinPrecio);
        if (p.modoPrecio) setModoPrecio(p.modoPrecio);
        if (p.descuento != null) setDescuento(p.descuento);
        if (p.fichas != null) setFichas(p.fichas);
        if (p.lista != null) setLista(p.lista);
        if (p.mostrarDetal != null) setMostrarDetal(p.mostrarDetal);
        setLineas(null);
        setCargando(true);
        api.products.catalogPdf()
            .then(r => setDatos(r))
            .catch(e => { notify(e.message, "err"); onClose(); })
            .finally(() => setCargando(false));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const todasLineas = datos?.lines || [];
    const claveLinea = (l) => l.id ?? 0;
    const marcada = (l) => lineas == null || lineas.includes(claveLinea(l));
    const alternar = (l) => {
        const actuales = lineas ?? todasLineas.map(claveLinea);
        const k = claveLinea(l);
        const nuevas = actuales.includes(k) ? actuales.filter(x => x !== k) : [...actuales, k];
        setLineas(nuevas.length === todasLineas.length ? null : nuevas);
    };

    const conteoLinea = useMemo(() => {
        const m = new Map();
        for (const p of datos?.products || []) {
            if (soloPublicados && !p.visible) continue;
            const k = p.category_id ?? 0;
            m.set(k, (m.get(k) || 0) + 1);
        }
        return m;
    }, [datos, soloPublicados]);

    // Lo que de verdad va al PDF con lo elegido.
    const elegidos = useMemo(() => {
        if (!datos) return null;
        const productos = datos.products.filter(p =>
            (!soloPublicados || p.visible) && (lineas == null || lineas.includes(p.category_id ?? 0)));
        return { ...datos, products: productos };
    }, [datos, lineas, soloPublicados]);

    const opciones = {
        titulo: titulo.trim() || "Catálogo de productos",
        condiciones: condiciones.trim(),
        sinPrecio, modoPrecio,
        descuento: parseFloat(descuento) || 0,
        mostrarDetal, fichas, lista,
        // "Ref." es jerga de caja; el cliente lee "$", igual que en la vitrina.
        simbolo: !baseCurrency?.symbol || /^ref/i.test(baseCurrency.symbol) ? "$" : baseCurrency.symbol,
        fecha: fechaHoy(),
    };

    const sinMayor = modoPrecio === "detal" ? 0 : (elegidos?.products.filter(p => p.wholesale_price == null).length ?? 0);
    const cuantos = elegidos ? (sinPrecio === "omitir" ? elegidos.products.length - sinMayor : elegidos.products.length) : 0;
    const paginas = useMemo(
        () => (elegidos && cuantos ? contarPaginas(elegidos, opciones) : 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [elegidos, cuantos, sinPrecio, modoPrecio, fichas, lista, titulo, condiciones]);

    const generar = () => {
        if (!cuantos) return;
        try {
            localStorage.setItem(PREF, JSON.stringify({ titulo, condiciones, sinPrecio, modoPrecio, descuento, fichas, lista, mostrarDetal }));
        } catch { /* sin almacenamiento: la próxima vez arranca con lo de fábrica */ }
        imprimirCatalogo(elegidos, opciones);
        notify("En el diálogo de impresión elige «Guardar como PDF»");
    };

    return (
        <Modal open={open} onClose={onClose} title="Catálogo PDF" width={720}
            footer={
                <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">
                        Cancelar
                    </button>
                    {cuantos > 0 && (
                        <button onClick={generar}
                            className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] flex items-center justify-center gap-2 tabular-nums">
                            Generar PDF de {cuantos} {cuantos === 1 ? "producto" : "productos"}
                        </button>
                    )}
                </div>
            }>
            {cargando || !datos ? (
                <div className="py-16 flex flex-col items-center gap-3 text-[13px] text-content-subtle">
                    <Spinner />
                    Juntando productos, fotos y precios…
                </div>
            ) : !datos.products.length ? (
                <div className="py-12 flex flex-col items-center text-center gap-2">
                    <span className="w-12 h-12 rounded-xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </span>
                    <p className="text-[14px] font-semibold text-content dark:text-white">No hay productos para el catálogo</p>
                    <p className="text-[12px] text-content-subtle">Solo entran los productos que se venden (los insumos no).</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_15rem] gap-5">
                    <div className="space-y-4 min-w-0">
                        <div>
                            <label className={LABEL}>Título de la portada</label>
                            <input className={`${INPUT} mt-1`} value={titulo} maxLength={60}
                                onChange={e => setTitulo(e.target.value)} placeholder="Catálogo de productos" />
                        </div>
                        <div>
                            <label className={`${LABEL} flex justify-between`}>
                                <span>Condiciones de venta</span><span className="font-normal">Opcional</span>
                            </label>
                            <textarea className={`${INPUT} !h-auto py-2 mt-1 resize-none`} rows={2} maxLength={300}
                                value={condiciones} onChange={e => setCondiciones(e.target.value)}
                                placeholder="Ej. Pedido mínimo 12 unidades surtidas. Precios en dólares." />
                            <p className="text-[11px] text-content-subtle mt-1">Salen en la portada y en la última página.</p>
                        </div>

                        <div>
                            <div className={LABEL}>Qué precio sale</div>
                            <Segmented value={modoPrecio} onChange={setModoPrecio}
                                className="mt-1.5 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center"
                                options={[{ key: "mayor", label: "Al mayor" }, { key: "detal", label: "Detal" }]} />
                            <p className="text-[11px] text-content-subtle mt-1 leading-snug">
                                {modoPrecio === "detal"
                                    ? "El precio de venta de siempre. En el catálogo dice solo «Precio»."
                                    : "El precio al mayor de cada producto (pestaña Costos). En el catálogo dice solo «Precio»."}
                            </p>
                        </div>

                        {modoPrecio === "mayor" && <div>
                            <div className={LABEL}>Productos sin precio al mayor{sinMayor > 0 ? ` (${sinMayor})` : ""}</div>
                            <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center gap-2">
                                <Segmented value={sinPrecio} onChange={setSinPrecio}
                                    className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center"
                                    options={[{ key: "descuento", label: "Descuento sobre el detal" }, { key: "omitir", label: "No incluirlos" }]} />
                                {sinPrecio === "descuento" && (
                                    <div className="relative w-full sm:w-28">
                                        <input className={`${INPUT} pr-8 tabular-nums`} inputMode="decimal" placeholder="0"
                                            value={descuento} onChange={e => setDescuento(e.target.value.replace(/[^0-9.]/g, ""))} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle">%</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[11px] text-content-subtle mt-1 leading-snug">
                                {sinPrecio === "omitir"
                                    ? "Solo salen los que tienen precio al mayor en su ficha (pestaña Costos)."
                                    : parseFloat(descuento) > 0
                                        ? `A los que no tienen precio al mayor se les pone el detal menos ${parseFloat(descuento)} %.`
                                        : "Sin descuento, los que no tienen precio al mayor salen con el precio detal."}
                            </p>
                        </div>}

                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                            <Opcion checked={fichas} onChange={setFichas} titulo="Página de ficha por producto"
                                detalle="Descripción, ingredientes y modo de uso, cuando el producto los tiene." />
                            <Opcion checked={lista} onChange={setLista} titulo="Lista de precios al final"
                                detalle="Todos los productos en una hoja, para armar el pedido." />
                            {modoPrecio === "mayor" && (
                                <Opcion checked={mostrarDetal} onChange={setMostrarDetal} titulo="Mostrar el PVP sugerido"
                                    detalle="El precio detal al lado del precio al mayor." />
                            )}
                            {company?.catalog_enabled && (
                                <Opcion checked={soloPublicados} onChange={setSoloPublicados} titulo="Solo los publicados en la vitrina" />
                            )}
                        </div>
                    </div>

                    <aside className="min-w-0 lg:border-l lg:border-border/60 dark:lg:border-white/[0.06] lg:pl-5">
                        <div className="flex items-center justify-between">
                            <div className="text-[14px] font-semibold text-content dark:text-white">Líneas</div>
                            <button type="button" onClick={() => setLineas(lineas == null ? [] : null)}
                                className="text-[12px] text-content-subtle hover:text-content dark:hover:text-white">
                                {lineas == null ? "Ninguna" : "Todas"}
                            </button>
                        </div>
                        <p className="text-[12px] text-content-subtle mt-0.5 mb-2">Cada categoría es una línea con su color.</p>
                        <div className="space-y-0.5 lg:max-h-[300px] lg:overflow-y-auto -mx-1">
                            {todasLineas.map(l => (
                                <div key={claveLinea(l)} onClick={() => alternar(l)}
                                    className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg cursor-pointer">
                                    <Check checked={marcada(l)} onChange={() => alternar(l)} title={l.name} />
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10" style={{ background: l.color || "transparent" }} />
                                    <span className="flex-1 min-w-0 truncate text-[13px] text-content dark:text-white">{l.name}</span>
                                    <span className="text-[12px] text-content-subtle tabular-nums">{conteoLinea.get(claveLinea(l)) || 0}</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/60 dark:border-white/[0.06] text-[12px] text-content-subtle space-y-1">
                            {cuantos > 0
                                ? <div>Unas <b className="text-content dark:text-white tabular-nums">{paginas}</b> páginas en hoja A4 apaisada.</div>
                                : <div>Marca al menos una línea con productos.</div>}
                            {datos.truncated && <div className="text-amber-600 dark:text-amber-400">Entran los primeros {datos.limit}: elige menos líneas para el resto.</div>}
                            <div>Al generar, elige «Guardar como PDF» en el diálogo de impresión.</div>
                        </div>
                    </aside>
                </div>
            )}
        </Modal>
    );
}

// Fila de opción: la fila entera se toca. Un div y no un <label>: el label le reenvía el clic
// al botón de la casilla y la opción cambiaba dos veces (quedaba igual).
function Opcion({ checked, onChange, titulo, detalle }) {
    return (
        <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={() => onChange(!checked)}>
            <Check checked={checked} onChange={onChange} title={titulo} className="mt-0.5" />
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                {detalle && <span className="block text-[12px] text-content-subtle leading-snug mt-0.5">{detalle}</span>}
            </span>
        </div>
    );
}
