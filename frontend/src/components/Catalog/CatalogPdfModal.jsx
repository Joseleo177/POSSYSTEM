import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../ui/Modal";
import Check from "../ui/Check";
import Segmented from "../ui/Segmented";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { armarCatalogoHtml, contarPaginas, imprimirCatalogo } from "../../helpers/catalogPdf";
import { catalogoAPdf, listaAPdf, nombreArchivo, descargar, sePuedeCompartir, compartir } from "../../helpers/pdfDirecto";
import { esPantallaTactil, esWebKitTactil } from "../../helpers/printDocument";
import { imprimirLista, paginasLista } from "../../helpers/priceListPdf";
import { monedaLocal } from "../../helpers/currency";

// Lista de precios (todas las empresas) y catálogo con fotos (extra por empresa) en PDF, de la
// sucursal que muestra el catálogo: sus productos y sus precios, los mismos que cobra su caja.
// Se traen los datos una sola vez por formato (una petición: ver services/products/catalogPdf.js
// en el backend) y todo lo demás —qué líneas, qué hacer con los productos sin precio al mayor—
// se filtra aquí, sin volver a pedir nada.
//
// Computadora: diálogo de impresión → "Guardar como PDF". Teléfono: el PDF se arma aquí mismo.

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaHoy = () => { const d = new Date(); return `${MESES[d.getMonth()].replace(/^./, c => c.toUpperCase())} ${d.getFullYear()}`; };

// Lo que se eligió la última vez: quien reparte el catálogo cada mes no debería volver a
// escribir las condiciones ni el descuento. Solo preferencias de este navegador.
const PREF = "catalogo_pdf_prefs";
const leerPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || "{}"); } catch { return {}; } };

export default function CatalogPdfModal({ open, onClose, warehouseId = null, sucursal = "" }) {
    const { notify, company, baseCurrency, activeCurrencies, sucursales } = useApp();
    // La lista de precios es de todas las empresas; el catálogo con fotos, de las que tienen el
    // extra (companies.catalogo_pdf_enabled). El precio al mayor, solo de las que venden al mayor
    // (companies.mayor_enabled): sin eso el catálogo sale con el precio normal del producto.
    const conCatalogo = !!company?.catalogo_pdf_enabled;
    const conMayor = !!company?.mayor_enabled;
    const local = monedaLocal(activeCurrencies) ?? null;
    const tasa = parseFloat(local?.exchange_rate || 0);
    // Dos formatos: el catálogo con fotos (dos páginas por producto) y la lista de precios
    // densa para repuestos, bodegas o la carpeta del vendedor (helpers/priceListPdf.js).
    // Sin el extra solo existe la lista.
    const [formatoElegido, setFormato] = useState("catalogo");
    const formato = conCatalogo ? formatoElegido : "lista";
    const [tituloLista, setTituloLista] = useState("Lista de precios");
    const [col, setCol] = useState({ codigo: true, foto: false, detal: true, mayor: false, bs: false });
    const ponerCol = (k) => (v) => setCol(c => ({ ...c, [k]: v }));
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [lineas, setLineas] = useState(null);           // ids marcados; null = todas
    const [titulo, setTitulo] = useState("Catálogo de productos");
    const [condiciones, setCondiciones] = useState("");
    const [sinPrecio, setSinPrecio] = useState("descuento");
    // Qué precio sale: el al mayor o el detal de siempre (quien todavía no cargó precios al
    // mayor igual puede repartir su catálogo con precios).
    const [modoElegido, setModoPrecio] = useState("mayor");
    // Sin venta al mayor no hay qué elegir: sale el precio normal.
    const modoPrecio = conMayor ? modoElegido : "detal";
    const [descuento, setDescuento] = useState("");
    const [soloPublicados, setSoloPublicados] = useState(false);
    const [fichas, setFichas] = useState(true);
    const [lista, setLista] = useState(true);
    const [mostrarDetal, setMostrarDetal] = useState(false);

    useEffect(() => {
        if (!open) return;
        const p = leerPrefs();
        if (p.titulo) setTitulo(p.titulo);
        if (p.formato && conCatalogo) setFormato(p.formato);
        if (p.tituloLista) setTituloLista(p.tituloLista);
        if (p.col) setCol(c => ({ ...c, ...p.col }));
        if (p.condiciones != null) setCondiciones(p.condiciones);
        if (p.sinPrecio) setSinPrecio(p.sinPrecio);
        if (p.modoPrecio) setModoPrecio(p.modoPrecio);
        if (p.descuento != null) setDescuento(p.descuento);
        if (p.fichas != null) setFichas(p.fichas);
        if (p.lista != null) setLista(p.lista);
        if (p.mostrarDetal != null) setMostrarDetal(p.mostrarDetal);
        setLineas(null);
    }, [open]);

    // Cada formato pide lo suyo: la lista no trae descripciones ni sellos y admite miles de
    // productos. `vigente` descarta la respuesta de un formato que ya se cambió.
    useEffect(() => {
        if (!open) return;
        let vigente = true;
        setCargando(true);
        setDatos(null);
        api.products.catalogPdf({ ...(formato === "lista" ? { formato: "lista" } : {}), ...(warehouseId ? { warehouse_id: warehouseId } : {}) })
            .then(r => { if (vigente) setDatos(r); })
            .catch(e => { if (vigente) { notify(e.message, "err"); onClose(); } })
            .finally(() => { if (vigente) setCargando(false); });
        return () => { vigente = false; };
    }, [open, formato, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const esLista = formato === "lista";
    // La lista necesita al menos una columna de precio: sin ninguna no hay qué listar.
    // Sin precio al mayor en la empresa, esa columna no existe aunque haya quedado marcada.
    const colReal = { ...col, mayor: col.mayor && conMayor };
    const sinColPrecio = esLista && !colReal.detal && !colReal.mayor;
    const sinMayor = esLista || modoPrecio === "detal" ? 0 : (elegidos?.products.filter(p => p.wholesale_price == null).length ?? 0);
    const cuantos = !elegidos || sinColPrecio ? 0
        : (!esLista && sinPrecio === "omitir" ? elegidos.products.length - sinMayor : elegidos.products.length);
    const paginas = useMemo(
        () => (!elegidos || !cuantos ? 0 : esLista ? paginasLista(elegidos) : contarPaginas(elegidos, opciones)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [elegidos, cuantos, esLista, sinPrecio, modoPrecio, fichas, lista, titulo, condiciones]);

    const guardarPrefs = () => {
        try {
            localStorage.setItem(PREF, JSON.stringify({ formato: formatoElegido, titulo, tituloLista, col, condiciones, sinPrecio, modoPrecio: modoElegido, descuento, fichas, lista, mostrarDetal }));
        } catch { /* sin almacenamiento: la próxima vez arranca con lo de fábrica */ }
    };
    const opcionesLista = () => ({
        titulo: tituloLista.trim() || "Lista de precios",
        condiciones: opciones.condiciones,
        columnas: { ...colReal, bs: colReal.bs && tasa > 0 },
        // Con varias sucursales, cuál es: cada una puede tener sus precios.
        sucursal: sucursales?.length > 1 ? sucursal : "",
        tasa, simboloLocal: local?.symbol || "Bs.",
        simbolo: opciones.simbolo,
        fecha: new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }),
    });

    // Computadora: diálogo de impresión (texto real, archivo liviano, sin márgenes que estorben).
    // Teléfono: el PDF se arma aquí mismo y se entrega con Compartir o Descargar (pdfDirecto.js).
    // En el iPhone imprimir no servía: Chrome, Brave y la app instalada no imprimen, y Safari
    // metía sus márgenes blancos alrededor de cada página (11-11-2026).
    const directo = esPantallaTactil();
    // En el iPhone la descarga tiene que salir de un toque del usuario: no se dispara sola.
    const esIOS = esWebKitTactil();

    const generar = () => {
        if (!cuantos) return;
        guardarPrefs();
        const como = esLista ? imprimirLista(elegidos, opcionesLista()) : imprimirCatalogo(elegidos, opciones);
        notify(como === "pestaña"
            ? "Se abrió en otra pestaña: toca «Guardar PDF» arriba"
            : "En el diálogo de impresión elige «Guardar como PDF»");
    };

    // `trabajo`: null | { fase, hecho, total } mientras se arma | { listo, blob, nombre }.
    const [trabajo, setTrabajo] = useState(null);
    const parar = useRef(false);
    useEffect(() => { if (!open) { parar.current = true; setTrabajo(null); } }, [open]);

    const armarDirecto = async () => {
        if (!cuantos || trabajo) return;
        guardarPrefs();
        parar.current = false;
        setTrabajo({ fase: "fotos", hecho: 0, total: 0 });
        try {
            const avance = (a) => setTrabajo(t => (t && !t.listo ? a : t));
            const blob = esLista
                ? await listaAPdf(elegidos, opcionesLista(), { alAvanzar: avance })
                : await catalogoAPdf(armarCatalogoHtml(elegidos, opciones), {
                    logoUrl: elegidos.store?.logo_url, alAvanzar: avance, debeParar: () => parar.current });
            if (!blob || parar.current) { setTrabajo(null); return; }
            const nombre = nombreArchivo(esLista ? opcionesLista().titulo : opciones.titulo, elegidos.store?.name);
            setTrabajo({ listo: true, blob, nombre });
            try { sessionStorage.removeItem("nxus_recarga_pdf"); } catch { /* modo privado */ }
            if (!esIOS) descargar(blob, nombre);
        } catch (e) {
            setTrabajo(null);
            // Tras un despliegue, la app abierta (o la instalada, que viene de la caché) pide las
            // librerías del PDF por su nombre viejo, que ya no existe en Vercel. Mismo arreglo que
            // App.jsx con las pantallas: recargar UNA vez para traer la versión nueva. Lo elegido
            // en el diálogo ya quedó guardado (guardarPrefs) y vuelve al abrirlo.
            const versionVieja = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(e?.message || "");
            let yaRecargo = true;
            try { yaRecargo = !!sessionStorage.getItem("nxus_recarga_pdf"); sessionStorage.setItem("nxus_recarga_pdf", "1"); } catch { /* modo privado */ }
            if (versionVieja && !yaRecargo) {
                notify("Hay una versión nueva de la app: se recarga sola. Luego vuelve a tocar Descargar.");
                setTimeout(() => window.location.reload(), 1800);
                return;
            }
            notify(e?.message ? `No se pudo armar el PDF: ${e.message}` : "No se pudo armar el PDF", "err");
        }
    };

    const listo = trabajo?.listo;
    const mb = listo ? trabajo.blob.size / 1024 / 1024 : 0;
    const puedeCompartir = listo && sePuedeCompartir(trabajo.blob, trabajo.nombre);
    const ICONO_BAJAR = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" /></svg>;
    const ICONO_COMPARTIR = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0-12l-4 4m4-4l4 4M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></svg>;

    // En el iPhone, Compartir va primero: es el que ofrece "Guardar en Archivos" y WhatsApp con
    // el PDF adjunto. En Android el archivo ya bajó solo y Compartir queda de segundo.
    const pie = listo ? (
        <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setTrabajo(null)} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">
                Volver
            </button>
            {puedeCompartir && (
                <button onClick={() => compartir(trabajo.blob, trabajo.nombre).catch(() => {})}
                    className={`${esIOS ? "btn-accent" : "btn-outline"} sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2`}>
                    {ICONO_COMPARTIR} Compartir o guardar
                </button>
            )}
            {/* En el iPhone, Descargar no guarda: abre el PDF en un visor como blob: y desde ahí
                se comparte la dirección, no el archivo (probado 11-11-2026 con la app instalada).
                Con Compartir disponible, ese botón sobra y confunde. */}
            {!(esIOS && puedeCompartir) && (
                <button onClick={() => descargar(trabajo.blob, trabajo.nombre)}
                    className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2">
                    {ICONO_BAJAR} Descargar
                </button>
            )}
        </div>
    ) : trabajo ? (
        <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => { parar.current = true; setTrabajo(null); }} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">
                Detener
            </button>
        </div>
    ) : (
        <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={onClose} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">
                Cancelar
            </button>
            {cuantos > 0 && (
                <button onClick={directo ? armarDirecto : generar}
                    className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] flex items-center justify-center gap-2 tabular-nums">
                    {directo && ICONO_BAJAR}
                    {directo ? "Descargar" : "Generar"} PDF de {cuantos} {cuantos === 1 ? "producto" : "productos"}
                </button>
            )}
        </div>
    );

    return (
        <Modal open={open} onClose={trabajo && !listo ? () => {} : onClose} title={conCatalogo ? "Catálogo PDF" : "Lista de precios"} width={720} footer={pie}>
            {trabajo ? (
                listo ? (
                    <div className="py-10 flex flex-col items-center text-center gap-2">
                        <span className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
                        </span>
                        <p className="text-[15px] font-semibold text-content dark:text-white">Tu PDF está listo</p>
                        <p className="text-[12px] text-content-subtle break-words max-w-sm">{trabajo.nombre} · <span className="whitespace-nowrap">{mb < 1 ? `${Math.max(1, Math.round(mb * 1024))} KB` : `${mb.toFixed(1)} MB`}</span></p>
                        <p className="text-[12px] text-content-subtle max-w-sm mt-1">
                            {esIOS && puedeCompartir
                                ? "Toca «Compartir o guardar» y elige Guardar en Archivos, o un contacto de WhatsApp para mandarle el PDF."
                                : puedeCompartir ? "Ya se descargó. Con Compartir lo mandas directo por WhatsApp."
                                : esIOS ? "Toca «Descargar» para guardarlo." : "Si no bajó solo, toca «Descargar»."}
                        </p>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center text-center gap-3">
                        <Spinner />
                        <p className="text-[14px] font-semibold text-content dark:text-white">
                            {trabajo.fase === "paginas" ? `Armando página ${trabajo.hecho} de ${trabajo.total}` : "Preparando las fotos…"}
                        </p>
                        <div className="w-full max-w-sm h-2 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                            <div className="h-full bg-brand-600 dark:bg-brand-500 transition-[width] duration-300"
                                style={{ width: `${trabajo.total ? Math.round((trabajo.hecho / trabajo.total) * 100) : 4}%` }} />
                        </div>
                        <p className="text-[12px] text-content-subtle max-w-sm">
                            {esLista ? "Un momento." : "Con muchos productos tarda unos minutos."} No cierres esta ventana.
                        </p>
                    </div>
                )
            ) : (<>
            <div className="mb-5">
                {conCatalogo && (
                    <Segmented value={formato} onChange={setFormato}
                        className="w-full mb-1.5 [&>button]:flex-1 [&>button]:justify-center"
                        options={[{ key: "catalogo", label: "Catálogo con fotos" }, { key: "lista", label: "Lista de precios" }]} />
                )}
                <p className="text-[12px] text-content-subtle leading-snug">
                    {esLista
                        ? "Una fila por producto, agrupada por categoría, en hoja vertical. Para repuestos, bodegas o los vendedores."
                        : "Portada, una página por línea y dos por producto, con fotos grandes, sellos y precio."}
                    {sucursales?.length > 1 && sucursal && <> Con los productos y precios de <b className="font-semibold text-content dark:text-white">{sucursal}</b>.</>}
                </p>
            </div>
            {cargando || !datos ? (
                <div className="py-16 flex flex-col items-center gap-3 text-[13px] text-content-subtle">
                    <Spinner />
                    {esLista ? "Juntando productos y precios…" : "Juntando productos, fotos y precios…"}
                </div>
            ) : !datos.products.length ? (
                <div className="py-12 flex flex-col items-center text-center gap-2">
                    <span className="w-12 h-12 rounded-xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </span>
                    <p className="text-[14px] font-semibold text-content dark:text-white">{esLista ? "No hay productos para la lista" : "No hay productos para el catálogo"}</p>
                    <p className="text-[12px] text-content-subtle">Solo entran los productos que se venden (los insumos no).</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_15rem] gap-5">
                    <div className="space-y-4 min-w-0">
                        <div>
                            <label className={LABEL}>{esLista ? "Título" : "Título de la portada"}</label>
                            {esLista ? (
                                <input className={`${INPUT} mt-1`} value={tituloLista} maxLength={60}
                                    onChange={e => setTituloLista(e.target.value)} placeholder="Lista de precios" />
                            ) : (
                                <input className={`${INPUT} mt-1`} value={titulo} maxLength={60}
                                    onChange={e => setTitulo(e.target.value)} placeholder="Catálogo de productos" />
                            )}
                        </div>
                        <div>
                            <label className={`${LABEL} flex justify-between`}>
                                <span>Condiciones de venta</span><span className="font-normal">Opcional</span>
                            </label>
                            <textarea className={`${INPUT} !h-auto py-2 mt-1 resize-none`} rows={2} maxLength={300}
                                value={condiciones} onChange={e => setCondiciones(e.target.value)}
                                placeholder={conMayor ? "Ej. Pedido mínimo 12 unidades surtidas. Precios en dólares." : "Ej. Precios en dólares, sujetos a cambio sin previo aviso."} />
                            <p className="text-[11px] text-content-subtle mt-1">
                                {esLista ? "Salen arriba de la lista." : "Salen en la portada y en la última página."}
                            </p>
                        </div>

                        {esLista && (
                            <div>
                                <div className={LABEL}>Columnas</div>
                                <div className="mt-1.5 rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                                    <Opcion checked={col.detal} onChange={ponerCol("detal")} titulo={conMayor ? "Precio detal" : "Precio"} />
                                    {conMayor && (
                                        <Opcion checked={col.mayor} onChange={ponerCol("mayor")} titulo="Precio al mayor"
                                            detalle="El de la ficha (pestaña Costos). Si un producto no lo tiene, sale una raya." />
                                    )}
                                    {local && (
                                        <Opcion checked={col.bs && tasa > 0} onChange={ponerCol("bs")}
                                            titulo={`En ${local.symbol || "Bs."} a la tasa de hoy`}
                                            detalle={tasa > 0
                                                ? `Tasa ${tasa.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}: se calcula al generar, así que la hoja vale para hoy.`
                                                : "No hay tasa cargada hoy."} />
                                    )}
                                    <Opcion checked={col.codigo} onChange={ponerCol("codigo")} titulo="Código" detalle="El código de barras." />
                                    <Opcion checked={col.foto} onChange={ponerCol("foto")} titulo="Foto pequeña"
                                        detalle="Una miniatura al inicio de cada fila. Con miles de productos el PDF tarda más." />
                                    {company?.catalog_enabled && (
                                        <Opcion checked={soloPublicados} onChange={setSoloPublicados} titulo="Solo los publicados en la vitrina" />
                                    )}
                                </div>
                                {sinColPrecio && <p className="text-[12px] text-danger mt-1.5">Marca al menos un precio.</p>}
                            </div>
                        )}

                        {!esLista && conMayor && <div>
                            <div className={LABEL}>Qué precio sale</div>
                            <Segmented value={modoPrecio} onChange={setModoPrecio}
                                className="mt-1.5 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none [&>button]:justify-center"
                                options={[{ key: "mayor", label: "Al mayor" }, { key: "detal", label: "Detal" }]} />
                            <p className="text-[11px] text-content-subtle mt-1 leading-snug">
                                {modoPrecio === "detal"
                                    ? "El precio de venta de siempre. En el catálogo dice solo «Precio»."
                                    : "El precio al mayor de cada producto (pestaña Costos). En el catálogo dice solo «Precio»."}
                            </p>
                        </div>}

                        {!esLista && modoPrecio === "mayor" && <div>
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

                        {!esLista && <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
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
                        </div>}
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
                                ? <div>{esLista ? "Cerca de" : "Unas"} <b className="text-content dark:text-white tabular-nums">{paginas}</b> páginas en hoja A4 {esLista ? "vertical" : "apaisada"}.</div>
                                : <div>{sinColPrecio ? "Marca al menos un precio." : "Marca al menos una línea con productos."}</div>}
                            {datos.truncated && <div className="text-amber-600 dark:text-amber-400">Entran los primeros {datos.limit}: elige menos líneas para el resto.</div>}
                            {!directo && <div>Al generar, elige «Guardar como PDF» en el diálogo de impresión.</div>}
                        </div>
                    </aside>
                </div>
            )}
            </>)}

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
