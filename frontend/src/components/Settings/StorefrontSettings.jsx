import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import { RowIcon } from "../ui/Ledger";
import { resolveImageUrl } from "../../helpers";

// Contenido de la vitrina pública: lo que el comercio cambia cada campaña sin llamar a nadie.
//
// Vive aparte de SettingsTab porque no es configuración del sistema sino contenido editorial
// —banners, anuncios, qué categorías se destacan— y porque tiene su propio ciclo de carga y
// guardado: los banners son registros con archivos, no claves de ajustes.
//
// Lo que se edita aquí solo lo ve el cliente final en /catalogo/<tienda>. Nada de esto afecta
// precios, inventario ni pedidos.
//
// La pantalla muestra solo lo que usa el diseño elegido: antes salían las nueve tarjetas para
// cualquier tema (los destacados y las frases con un "solo el diseño Tienda lo muestra" en
// letra chica) y había que bajar mucho sin saber qué de todo eso se veía en la vitrina. Lo que
// se oculta no se borra: al volver al diseño que lo usa sigue ahí.

const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const LABEL = "text-[12px] font-medium text-content-subtle";
const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none";
const QUITAR = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";

// Los temas que existen en el frontend (ver pages/catalogThemes/index.js). El servidor acepta
// cualquier nombre con forma válida y es el catálogo el que cae al estándar si no lo conoce,
// así que esta lista es solo para no obligar al comercio a escribirlo a mano. `usa` dice qué
// secciones de esta pantalla tienen efecto en cada uno (lo leen los CatalogLayout de cada tema).
const TEMAS = [
    { value: "", label: "Estándar", detalle: "Lista de productos con buscador y filtros, sin portada.", usa: [] },
    { value: "boutique", label: "Tienda", detalle: "Portada con carrusel, menú superior, frases de marca y destacados.", usa: ["banners", "destacados", "menu", "frases", "anuncio"] },
    { value: "menu", label: "Menú", detalle: "Carta por categorías, pensada para restaurantes. Avisos arriba y colores propios.", usa: ["banners", "fondos"] },
    { value: "servicios", label: "Servicios", detalle: "Barberías, spas, consultorios: portada con «Reservar cita», servicios con duración y precio, el equipo y el horario.", usa: ["banners", "destacados", "frases", "anuncio", "fondos"] },
];

// placement: 'hero' = carrusel de portada; 'feature' = destacados con texto al pie de la
// portada (ver migración 20260924100000-catalog-banner-placement).
const BANNER_VACIO = { title: "", alt_text: "", link_url: "", heading: "", body: "", active: true, placement: "hero" };

// Colores sugeridos para la vitrina. No son una paleta cerrada —al lado hay un selector
// libre— sino un punto de partida: son tonos con suficiente fuerza para una tienda y que
// mantienen el texto blanco legible encima del botón, que es donde un color demasiado claro
// se rompe.
const COLORES = [
    ["#E11D5C", "Fucsia"],
    ["#DC2626", "Rojo"],
    ["#EA580C", "Naranja"],
    ["#CA8A04", "Dorado"],
    ["#16A34A", "Verde"],
    ["#0891B2", "Turquesa"],
    ["#2563EB", "Azul"],
    ["#7C3AED", "Violeta"],
    ["#DB2777", "Rosa"],
    ["#1F2937", "Negro"],
];

// Tonos claros para el panel del tema de menú: aquí van fotos y texto oscuro encima, así
// que al revés de COLORES buscan poco contraste entre sí y mucho contraste CON el texto —
// nada muy saturado.
const COLORES_PANEL = [
    ["#F4FAF6", "Menta claro"],
    ["#FFFFFF", "Blanco"],
    ["#FAF3E8", "Crema"],
    ["#FDF2F8", "Rosa claro"],
    ["#EFF6FF", "Azul claro"],
];

// Fondo de página y cabecera del tema de menú. Todos oscuros a propósito: el texto de la
// cabecera (nombre de la tienda, carrito, "Atrás") es blanco fijo y no se adapta al color
// elegido —igual que el color de marca de las otras vitrinas—, así que un tono claro aquí
// dejaría ese texto ilegible. El selector libre permite otro color igual, pero conviene que
// se mantenga oscuro.
const COLORES_FONDO = [
    ["#0A0A0A", "Negro"],
    ["#101922", "Azul noche"],
    ["#1A120B", "Café oscuro"],
    ["#0F1A14", "Verde oscuro"],
    ["#1F1B24", "Morado oscuro"],
];

// Lo que guarda la barra de abajo. Se usa también para saber si hay cambios sin guardar: los
// banners quedan fuera porque se guardan en el acto, cada uno con su modal.
const payload = (s, menu, highlights) => ({
    catalog_theme: s.catalog_theme || "",
    catalog_brand_color: s.catalog_brand_color || "",
    catalog_panel_color: s.catalog_panel_color || "",
    catalog_bg_color: s.catalog_bg_color || "",
    catalog_announcement_text: s.catalog_announcement_text || "",
    catalog_announcement_link: s.catalog_announcement_link || "",
    catalog_instagram: s.catalog_instagram || "",
    catalog_facebook: s.catalog_facebook || "",
    catalog_menu: JSON.stringify(menu.filter(m => m.category_id)),
    catalog_highlights: JSON.stringify(highlights.map(h => h.trim()).filter(Boolean)),
});

export default function StorefrontSettings({ notify }) {
    const [settings, setSettings] = useState({});
    const [banners, setBanners] = useState([]);
    const [categories, setCategories] = useState([]);
    const [menu, setMenu] = useState([]);
    const [highlights, setHighlights] = useState([]);
    const [saved, setSaved] = useState(null);

    // Edición de un banner. `null` = cerrado; un objeto sin id = uno nuevo.
    const [editing, setEditing] = useState(null);
    const [files, setFiles] = useState({});
    const [borrar, setBorrar] = useState(null);

    const load = async () => {
        try {
            const [s, b, c] = await Promise.all([
                api.settings.getAll(),
                api.catalogBanners.getAll(),
                api.categories.getAll(),
            ]);
            // El menú se guarda como JSON en un ajuste. Un valor ilegible no puede dejar la
            // pantalla en blanco: se empieza de cero y al guardar se corrige solo.
            let m = [], h = [];
            try { m = JSON.parse(s.data.catalog_menu || "[]"); } catch { m = []; }
            try { h = JSON.parse(s.data.catalog_highlights || "[]"); } catch { h = []; }
            setSettings(s.data);
            setMenu(m);
            setHighlights(h);
            setSaved(JSON.stringify(payload(s.data, m, h)));
            setBanners(b.data);
            setCategories(c.data);
        } catch (e) { notify(e.message, "err"); }
    };

    // Recarga solo los banners: guardar uno no puede pisar lo que se esté editando arriba.
    const loadBanners = async () => {
        try { setBanners((await api.catalogBanners.getAll()).data); }
        catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    const set = (key, value) => setSettings(p => ({ ...p, [key]: value }));

    const actual = JSON.stringify(payload(settings, menu, highlights));
    const dirty = saved !== null && actual !== saved;

    const guardar = async () => {
        try {
            // Solo las claves de vitrina: settings.update hace upsert de lo que reciba, así
            // que mandar el objeto entero reescribiría ajustes de otras pestañas con lo que
            // esta pantalla tenía cargado.
            await api.settings.update(payload(settings, menu, highlights));
            setSaved(actual);
            notify("Vitrina guardada correctamente");
        } catch (e) { notify(e.message, "err"); }
    };

    const tema = TEMAS.find(t => t.value === (settings.catalog_theme || "")) || TEMAS[0];
    const usa = (seccion) => tema.usa.includes(seccion);

    // ── Banners ──────────────────────────────────────────────────
    const heroes = banners.filter(b => b.placement !== "feature");
    const destacados = banners.filter(b => b.placement === "feature");

    const abrirNuevo = (placement = "hero") => { setEditing({ ...BANNER_VACIO, placement }); setFiles({}); };
    const abrirEdicion = (b) => { setEditing({ ...b }); setFiles({}); };
    const cerrar = () => { setEditing(null); setFiles({}); };

    const guardarBanner = async () => {
        const esDestacado = editing.placement === "feature";
        if (!editing.id && !files.image) return notify("Falta la imagen", "err");
        if (esDestacado && !(editing.heading || "").trim() && !(editing.body || "").trim()) {
            return notify("Escribe al menos el título o el texto", "err");
        }
        try {
            const campos = {
                title: editing.title || "",
                alt_text: editing.alt_text || "",
                link_url: editing.link_url || "",
                active: editing.active,
                ...(editing.id ? {} : { placement: editing.placement }),
                ...(esDestacado ? { heading: editing.heading || "", body: editing.body || "" } : {}),
                ...(editing.clear_mobile ? { clear_mobile: "true" } : {}),
            };
            if (editing.id) await api.catalogBanners.update(editing.id, campos, files);
            else await api.catalogBanners.create(campos, files);
            cerrar();
            await loadBanners();
            notify(esDestacado ? "Destacado guardado correctamente" : "Banner guardado correctamente");
        } catch (e) { notify(e.message, "err"); }
    };

    const eliminarBanner = async () => {
        try {
            await api.catalogBanners.remove(borrar.id);
            setBorrar(null);
            await loadBanners();
            notify(borrar.placement === "feature" ? "Destacado eliminado" : "Banner eliminado");
        } catch (e) { notify(e.message, "err"); }
    };

    // Subir y bajar en vez de arrastrar: la vitrina se configura tanto desde una tablet como
    // desde el escritorio, y arrastrar con el dedo pelea con el desplazamiento de la página.
    // Cada carrusel se ordena por su cuenta: `lista` es solo el de la tarjeta donde se tocó.
    const mover = async (lista, index, delta) => {
        const destino = index + delta;
        if (destino < 0 || destino >= lista.length) return;
        const next = [...lista];
        [next[index], next[destino]] = [next[destino], next[index]];
        const ids = new Set(next.map(b => b.id));
        setBanners([...banners.filter(b => !ids.has(b.id)), ...next]);
        try {
            await api.catalogBanners.reorder(next.map(b => b.id));
        } catch (e) {
            notify(e.message, "err");
            loadBanners(); // el orden de la pantalla ya no es el de la base
        }
    };

    const alternarActivo = async (b) => {
        try {
            await api.catalogBanners.update(b.id, {
                title: b.title || "", alt_text: b.alt_text || "",
                link_url: b.link_url || "", active: !b.active,
            }, {});
            await loadBanners();
        } catch (e) { notify(e.message, "err"); }
    };

    // ── Menú superior ────────────────────────────────────────────
    const opcionesCategoria = [
        { value: "", label: "Elegir categoría..." },
        ...categories.map(c => ({ value: String(c.id), label: c.name })),
    ];

    const cambiarMenu = (i, campo, valor) =>
        setMenu(prev => prev.map((m, idx) => idx === i ? { ...m, [campo]: valor } : m));

    if (saved === null) return <div className="m-3 sm:m-4 h-40 rounded-2xl bg-surface-2 dark:bg-white/[0.03] animate-pulse" />;

    return (
        <>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar py-3 sm:p-4 space-y-4">
                {/* ── Diseño ── primero, porque decide qué secciones aparecen debajo. */}
                <Seccion titulo="Diseño de la vitrina" detalle="Cómo se ve el catálogo público. Debajo aparece solo lo que usa el diseño elegido.">
                    <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {TEMAS.map(t => {
                            const on = t.value === tema.value;
                            return (
                                <button key={t.value || "estandar"} type="button" role="radio" aria-checked={on}
                                    onClick={() => set("catalog_theme", t.value)}
                                    className={`text-left rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors ${on
                                        ? "border-brand-500 ring-2 ring-brand-500/20 bg-brand-500/[0.04]"
                                        : "border-border/70 dark:border-white/[0.08] hover:border-content-subtle/50 dark:hover:border-white/20"}`}>
                                    <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center ${on
                                        ? "border-[5px] border-brand-600 dark:border-brand-500"
                                        : "border-[1.5px] border-content-subtle/60 dark:border-white/35"}`} />
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-content dark:text-white">{t.label}</span>
                                        {/* En el teléfono solo la del elegido: tres párrafos apilados
                                            empujaban todo lo demás fuera de la pantalla. */}
                                        <span className={`${on ? "block" : "hidden sm:block"} text-[12px] text-content-subtle mt-0.5 leading-snug`}>{t.detalle}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </Seccion>

                {/* Dos columnas que crecen cada una por su lado: con una grilla de filas parejas,
                    al lado del menú superior (alto) quedaba media tarjeta en blanco. */}
                <div className="grid gap-4 lg:grid-cols-2 items-start">
                    <div className="space-y-4 min-w-0">
                    {/* ── Colores ── */}
                    <Seccion titulo="Colores" detalle="Solo el catálogo público. El color del sistema se configura en Empresa.">
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            <ColorFila
                                titulo="Color de la tienda" ayuda="Botones, precios y enlaces."
                                value={settings.catalog_brand_color} onChange={v => set("catalog_brand_color", v)}
                                opciones={COLORES} porDefecto="#E11D5C" restablecer="Usar el del sistema"
                            />
                            {usa("fondos") && (
                                <ColorFila
                                    titulo="Fondo y cabecera" ayuda="El texto de arriba es blanco fijo: conviene un tono oscuro."
                                    value={settings.catalog_bg_color} onChange={v => set("catalog_bg_color", v)}
                                    opciones={COLORES_FONDO} porDefecto="#0A0A0A" restablecer="Tono por defecto"
                                />
                            )}
                            {usa("fondos") && (
                                <ColorFila
                                    titulo={tema.value === "servicios" ? "Fondo del contenido" : "Panel de la carta"}
                                    ayuda={tema.value === "servicios" ? "Donde van los servicios y el equipo, con texto oscuro: conviene un tono claro." : "Donde van la foto de categoría y los platos, con texto oscuro: conviene un tono claro."}
                                    value={settings.catalog_panel_color} onChange={v => set("catalog_panel_color", v)}
                                    opciones={COLORES_PANEL} porDefecto={tema.value === "servicios" ? "#F5F0E8" : "#F4FAF6"} restablecer="Tono por defecto"
                                />
                            )}
                        </div>
                    </Seccion>

                    {/* ── Menú superior ── */}
                    {usa("menu") && (
                        <Seccion titulo="Menú superior" detalle="Las categorías de la barra de arriba. Sin ninguna, se muestran las tres primeras."
                            aside={<span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{menu.length} de 10</span>}>
                            {menu.length > 0 && (
                                <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_100px_40px] gap-2 mb-1.5">
                                    <span className={LABEL}>Categoría</span>
                                    <span className={LABEL}>Otro nombre</span>
                                    <span className={LABEL}>Etiqueta</span>
                                </div>
                            )}
                            <div className="space-y-3 sm:space-y-2">
                                {menu.map((m, i) => (
                                    // En el teléfono, dos renglones: la categoría con su X arriba y los dos
                                    // textos abajo; desde sm, una sola fila bajo los rótulos.
                                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_100px_40px] gap-2 pb-3 sm:pb-0 border-b sm:border-0 border-border/60 dark:border-white/[0.06]">
                                        <div className="min-w-0 col-span-2 sm:col-span-1">
                                            <CustomSelect
                                                value={String(m.category_id || "")}
                                                onChange={(v) => cambiarMenu(i, "category_id", v ? parseInt(v, 10) : "")}
                                                options={opcionesCategoria}
                                            />
                                        </div>
                                        <button type="button" title="Quitar" aria-label="Quitar"
                                            onClick={() => setMenu(prev => prev.filter((_, idx) => idx !== i))}
                                            className={`${QUITAR} sm:order-last`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <input className={INPUT} placeholder="Otro nombre" autoComplete="off"
                                            value={m.label || ""}
                                            onChange={(e) => cambiarMenu(i, "label", e.target.value)} />
                                        <input className={`${INPUT} col-span-2 sm:col-span-1`} placeholder="Etiqueta, ej. Nuevo" autoComplete="off"
                                            value={m.badge || ""}
                                            onChange={(e) => cambiarMenu(i, "badge", e.target.value)} />
                                    </div>
                                ))}
                                {menu.length < 10 && (
                                    <button type="button" className={AGREGAR}
                                        onClick={() => setMenu(prev => [...prev, { category_id: "", label: "", badge: "" }])}>
                                        <IconoMas />
                                        Agregar categoría
                                    </button>
                                )}
                            </div>
                        </Seccion>
                    )}

                    </div>

                    <div className="space-y-4 min-w-0">
                    {/* ── Carrusel de portada ── en el tema de menú son avisos apilados. */}
                    {usa("banners") && (
                        <BannerList
                            titulo={tema.value === "menu" ? "Avisos" : "Carrusel de portada"}
                            detalle={tema.value === "menu"
                                ? "Imágenes sobre las categorías. El texto va dentro de la imagen."
                                : "Las imágenes grandes de la portada. El texto de la promoción va dentro de la imagen."}
                            agregar={tema.value === "menu" ? "Agregar aviso" : "Agregar banner"}
                            vacio={tema.value === "menu"
                                ? "Sin avisos: la carta abre directo en las categorías."
                                : "Sin imágenes: la vitrina abre directo en los productos."}
                            items={heroes}
                            onAdd={() => abrirNuevo("hero")}
                            onMove={(i, d) => mover(heroes, i, d)}
                            onToggle={alternarActivo} onEdit={abrirEdicion} onDelete={setBorrar}
                            detail={(b) => [b.link_url || "Sin enlace", !b.image_mobile_url && "sin arte de móvil"].filter(Boolean).join(" · ")}
                        />
                    )}

                    {/* ── Frases de marca ──
                        El bloque corto entre el carrusel y los productos, del tipo "Expertos en
                        reparación · Anticaída · Crecimiento". Es lo que separa una vitrina con
                        cara de tienda de marca de una lista de productos cualquiera: unas pocas
                        palabras dicen en qué es buena la tienda antes de que el cliente empiece a
                        mirar precios. */}
                    {usa("frases") && (
                        <Seccion titulo="Frases de marca" detalle="Muy cortas, junto al eslogan de Empresa. Sin frases, la sección no se muestra."
                            aside={<span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{highlights.length} de 5</span>}>
                            <div className="space-y-2">
                                {highlights.map((h, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <input className={INPUT} placeholder="Ej. Fórmulas naturales" maxLength={40} autoComplete="off"
                                            value={h}
                                            onChange={(e) => setHighlights(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} />
                                        <button type="button" title="Quitar" aria-label="Quitar" className={QUITAR}
                                            onClick={() => setHighlights(prev => prev.filter((_, idx) => idx !== i))}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                                {highlights.length < 5 && (
                                    <button type="button" className={AGREGAR} onClick={() => setHighlights(prev => [...prev, ""])}>
                                        <IconoMas />
                                        Agregar frase
                                    </button>
                                )}
                            </div>
                        </Seccion>
                    )}

                    {/* ── Destacados al pie de la portada ── */}
                    {usa("destacados") && (
                        <BannerList
                            titulo="Destacados al pie"
                            detalle="Imagen a un lado y tu texto al otro, antes del pie de página. Para contar qué hace un producto o una línea."
                            agregar="Agregar destacado"
                            vacio="Sin destacados: la sección no se muestra."
                            items={destacados}
                            onAdd={() => abrirNuevo("feature")}
                            onMove={(i, d) => mover(destacados, i, d)}
                            onToggle={alternarActivo} onEdit={abrirEdicion} onDelete={setBorrar}
                            detail={(b) => b.body || "Sin texto"}
                            name={(b) => b.heading || b.title}
                        />
                    )}

                    {/* ── Anuncio y redes ── */}
                    {usa("anuncio") && (
                        <Seccion titulo="Anuncio y redes sociales" detalle="La franja sobre la cabecera y los enlaces del pie. Lo que quede vacío no se muestra.">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Campo label="Texto del anuncio" className="sm:col-span-2">
                                    <input className={INPUT} placeholder="Ej. Envío gratis por compras mayores a $50" maxLength={160} autoComplete="off"
                                        value={settings.catalog_announcement_text || ""}
                                        onChange={(e) => set("catalog_announcement_text", e.target.value)} />
                                </Campo>
                                <Campo label="Enlace del anuncio" hint="Opcional" className="sm:col-span-2">
                                    <input className={INPUT} placeholder="https://..." autoComplete="off"
                                        value={settings.catalog_announcement_link || ""}
                                        onChange={(e) => set("catalog_announcement_link", e.target.value)} />
                                </Campo>
                                <Campo label="Instagram">
                                    <input className={INPUT} placeholder="https://instagram.com/tutienda" autoComplete="off"
                                        value={settings.catalog_instagram || ""}
                                        onChange={(e) => set("catalog_instagram", e.target.value)} />
                                </Campo>
                                <Campo label="Facebook">
                                    <input className={INPUT} placeholder="https://facebook.com/tutienda" autoComplete="off"
                                        value={settings.catalog_facebook || ""}
                                        onChange={(e) => set("catalog_facebook", e.target.value)} />
                                </Campo>
                            </div>
                        </Seccion>
                    )}
                    </div>
                </div>
            </div>

            {/* Barra de guardado: la misma de Empresa y Factura, fuera del área que se desplaza.
                Los banners no pasan por ella: se guardan al aceptar su ventana. */}
            <div className="shrink-0 -mx-3 sm:-mx-4 -mb-2 px-4 py-2.5 bg-white dark:bg-surface-dark-2 border-t border-border/60 dark:border-white/[0.06] flex items-center justify-end gap-3">
                {dirty ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Cambios sin guardar
                    </span>
                ) : (
                    <span className="text-[13px] text-content-subtle">Todo guardado</span>
                )}
                <Button onClick={guardar} disabled={!dirty}>Guardar cambios</Button>
            </div>

            {/* ── Modal de banner o destacado ── */}
            <Modal
                open={!!editing}
                onClose={cerrar}
                title={editing?.placement === "feature"
                    ? (editing?.id ? "Editar destacado" : "Nuevo destacado")
                    : (editing?.id ? "Editar banner" : "Nuevo banner")}
                width={560}
                footer={(
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="ghost" onClick={cerrar} className="h-12 sm:h-10 sm:flex-1">Cancelar</Button>
                        <Button onClick={guardarBanner} className="h-12 sm:h-10 sm:flex-[2]">Guardar</Button>
                    </div>
                )}
            >
                {editing && editing.placement === "feature" && (
                    <div className="space-y-4">
                        <ImagePicker
                            label="Imagen"
                            hint="Apaisada, ej. 1600 × 900. En el teléfono va arriba del texto."
                            current={editing.image_url}
                            file={files.image}
                            onPick={(f) => setFiles(p => ({ ...p, image: f }))}
                        />
                        <Campo label="Título">
                            <input className={INPUT} placeholder="Ej. Ideal para reconstrucción inmediata" maxLength={120} autoComplete="off" data-autofocus
                                value={editing.heading || ""}
                                onChange={(e) => setEditing(p => ({ ...p, heading: e.target.value }))} />
                        </Campo>
                        <Campo label="Texto">
                            <textarea className={`${INPUT} !h-auto min-h-[84px] py-2.5 resize-none`} placeholder="Qué hace el producto, en dos o tres líneas"
                                maxLength={400}
                                value={editing.body || ""}
                                onChange={(e) => setEditing(p => ({ ...p, body: e.target.value }))} />
                        </Campo>
                        <Campo label="Enlace" hint="Opcional" ayuda='Con enlace aparece un botón "Ver más" bajo el texto.'>
                            <input className={INPUT} placeholder="https://... o /catalogo/mi-tienda/p/123" autoComplete="off"
                                value={editing.link_url || ""}
                                onChange={(e) => setEditing(p => ({ ...p, link_url: e.target.value }))} />
                        </Campo>
                        <Mostrar value={editing.active} onChange={v => setEditing(p => ({ ...p, active: v }))} />
                    </div>
                )}

                {editing && editing.placement !== "feature" && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <ImagePicker
                                label="Escritorio"
                                hint="Apaisada y ancha, ej. 1920 × 720."
                                current={editing.image_url}
                                file={files.image}
                                onPick={(f) => setFiles(p => ({ ...p, image: f }))}
                            />
                            <ImagePicker
                                label="Móvil"
                                opcional
                                hint="Casi cuadrada. Sin ella se usa la de escritorio."
                                current={editing.clear_mobile ? null : editing.image_mobile_url}
                                file={files.image_mobile}
                                onPick={(f) => setFiles(p => ({ ...p, image_mobile: f }))}
                                onClear={editing.image_mobile_url && !editing.clear_mobile
                                    ? () => setEditing(p => ({ ...p, clear_mobile: true }))
                                    : null}
                            />
                        </div>
                        <Campo label="Nombre interno" ayuda="Solo para reconocerlo en esta lista.">
                            <input className={INPUT} placeholder="Ej. Regreso a clases" autoComplete="off" data-autofocus
                                value={editing.title || ""}
                                onChange={(e) => setEditing(p => ({ ...p, title: e.target.value }))} />
                        </Campo>
                        <Campo label="Enlace al tocarlo" hint="Opcional">
                            <input className={INPUT} placeholder="https://... o /catalogo/mi-tienda" autoComplete="off"
                                value={editing.link_url || ""}
                                onChange={(e) => setEditing(p => ({ ...p, link_url: e.target.value }))} />
                        </Campo>
                        {/* Es lo que se lee si la imagen no carga, y lo único que reciben los
                            clientes que usan lector de pantalla: el mensaje está dentro del arte. */}
                        <Campo label="Qué dice la imagen" ayuda="Se lee si la imagen no carga y en los lectores de pantalla.">
                            <input className={INPUT} placeholder="Ej. 20% de descuento en útiles escolares" autoComplete="off"
                                value={editing.alt_text || ""}
                                onChange={(e) => setEditing(p => ({ ...p, alt_text: e.target.value }))} />
                        </Campo>
                        <Mostrar value={editing.active} onChange={v => setEditing(p => ({ ...p, active: v }))} />
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!borrar}
                title={borrar?.placement === "feature" ? "Eliminar destacado" : "Eliminar banner"}
                message={`Se elimina "${borrar?.heading || borrar?.title || "esta imagen"}" y su imagen. No se puede deshacer.`}
                confirmText="Eliminar"
                type="danger"
                onConfirm={eliminarBanner}
                onCancel={() => setBorrar(null)}
            />
        </>
    );
}

// ── piezas ───────────────────────────────────────────────────────────────────

// Tarjeta de sección, igual a la de SettingsTab y Pedidos web; `aside` va a la derecha del título.
function Seccion({ titulo, detalle, aside = null, className = "", children }) {
    return (
        <section className={`${SECTION} p-4 sm:p-5 ${className}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-content dark:text-white">{titulo}</h3>
                    {detalle && <p className="text-[12px] text-content-subtle mt-0.5">{detalle}</p>}
                </div>
                {aside}
            </div>
            {children}
        </section>
    );
}

// Rótulo arriba, "Opcional" a la derecha y, si hace falta, una ayuda debajo del campo.
function Campo({ label, hint, ayuda, className = "", children }) {
    return (
        <div className={`min-w-0 ${className}`}>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
            {ayuda && <p className="mt-1.5 text-[12px] text-content-subtle leading-relaxed">{ayuda}</p>}
        </div>
    );
}

const IconoMas = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
);

function Mostrar({ value, onChange }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <Check checked={!!value} onChange={onChange} title="Mostrar en la vitrina" />
            <span className="text-[13px] font-medium text-content dark:text-white">Mostrar en la vitrina</span>
        </label>
    );
}

// Un color de la vitrina: muestras sugeridas, selector libre con su código y volver al de
// siempre. Las tres filas de Colores son esta misma.
function ColorFila({ titulo, ayuda, value, onChange, opciones, porDefecto, restablecer }) {
    const actual = (value || "").toLowerCase();
    return (
        <div className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                {value && (
                    <button type="button" onClick={() => onChange("")}
                        className="shrink-0 text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                        {restablecer}
                    </button>
                )}
            </div>
            <p className="text-[12px] text-content-subtle mt-0.5">{ayuda}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {opciones.map(([hex, nombre]) => {
                    const on = actual === hex.toLowerCase();
                    return (
                        <button key={hex} type="button" title={nombre} aria-label={nombre} aria-pressed={on}
                            onClick={() => onChange(hex)}
                            className={`w-8 h-8 rounded-lg border border-black/10 dark:border-white/15 transition-shadow ${on
                                ? "ring-2 ring-offset-2 ring-content dark:ring-white ring-offset-white dark:ring-offset-surface-dark-2"
                                : ""}`}
                            style={{ backgroundColor: hex }} />
                    );
                })}
            </div>

            <div className="mt-3 flex items-center gap-2">
                <label className="relative shrink-0 cursor-pointer" title="Elegir otro color">
                    <span className="block w-10 h-10 rounded-lg border border-black/10 dark:border-white/15"
                        style={{ backgroundColor: value || porDefecto }} />
                    <input type="color" value={value || porDefecto}
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                </label>
                <input className={`${INPUT} max-w-[160px] tabular-nums uppercase`} placeholder="Sin elegir" autoComplete="off"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value.trim())} />
            </div>
        </div>
    );
}

// Lista de un carrusel (portada o destacados): miniatura, orden, visibilidad y borrado. Tocar
// la fila abre la edición. Las dos secciones son la misma lista con otro texto; lo que cambia
// de una a otra es qué detalle se muestra bajo el nombre.
function BannerList({ titulo, detalle, agregar, vacio, items, onAdd, onMove, onToggle, onEdit, onDelete, detail, name = (b) => b.title }) {
    return (
        <Seccion titulo={titulo} detalle={detalle}
            aside={items.length > 0 && <span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{items.length}</span>}>
            {items.length > 0 && (
                <ul className="mb-3 rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                    {items.map((b, i) => (
                        <li key={b.id} className="pl-2 pr-1.5 py-2 flex items-center gap-3">
                            <button type="button" onClick={() => onEdit(b)} className="flex-1 min-w-0 flex items-center gap-3 text-left group">
                                <span className={`w-16 h-10 sm:w-20 sm:h-12 shrink-0 rounded-lg overflow-hidden bg-surface-2 dark:bg-white/[0.05] ${b.active ? "" : "opacity-40"}`}>
                                    <img src={resolveImageUrl(b.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-medium text-content dark:text-white truncate group-hover:underline">{name(b) || "Sin nombre"}</span>
                                    <span className="block text-[12px] text-content-subtle truncate">
                                        {b.active ? detail(b) : "Oculto en la vitrina"}
                                    </span>
                                </span>
                            </button>
                            <div className="flex items-center shrink-0">
                                <RowIcon icon="M5 15l7-7 7 7" title="Subir" onClick={() => onMove(i, -1)} disabled={i === 0} className="hidden sm:inline-flex" />
                                <RowIcon icon="M19 9l-7 7-7-7" title="Bajar" onClick={() => onMove(i, 1)} disabled={i === items.length - 1} className="hidden sm:inline-flex" />
                                <RowIcon icon={b.active ? "eye" : OJO_TACHADO} title={b.active ? "Ocultar en la vitrina" : "Mostrar en la vitrina"} onClick={() => onToggle(b)} />
                                <RowIcon icon="trash" tone="danger" title="Eliminar" onClick={() => onDelete(b)} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {items.length === 0 && <p className="mb-3 text-[12px] text-content-subtle">{vacio}</p>}
            <button type="button" onClick={onAdd} className={AGREGAR}>
                <IconoMas />
                {agregar}
            </button>
        </Seccion>
    );
}

const OJO_TACHADO = "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21";

// Selector de imagen con vista previa. Muestra la que ya está guardada hasta que se elige
// otra, y recién entonces la nueva: así se ve qué se va a reemplazar antes de guardar.
function ImagePicker({ label, opcional, hint, current, file, onPick, onClear }) {
    const preview = file ? URL.createObjectURL(file) : (current ? resolveImageUrl(current) : null);

    return (
        <Campo label={label} hint={onClear ? null : (opcional ? "Opcional" : null)}>
            <label className="cursor-pointer group block">
                <div className="w-full h-28 bg-surface-2 dark:bg-white/[0.04] border border-dashed border-border dark:border-white/15 rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden group-hover:border-content-subtle/60 transition-colors">
                    {preview
                        ? <img src={preview} alt="" className="w-full h-full object-cover" />
                        : (
                            <>
                                <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                <span className="text-[12px] font-medium text-content-subtle">Subir imagen</span>
                            </>
                        )}
                </div>
                <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files[0] && onPick(e.target.files[0])} />
            </label>
            <div className="flex items-start justify-between gap-2 mt-1.5">
                <p className="text-[12px] text-content-subtle leading-snug">{hint}</p>
                {onClear && (
                    <button type="button" onClick={onClear}
                        className="shrink-0 text-[12px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        Quitar
                    </button>
                )}
            </div>
        </Campo>
    );
}
