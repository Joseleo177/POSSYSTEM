import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import { resolveImageUrl } from "../../helpers";

// Contenido de la vitrina pública: lo que el comercio cambia cada campaña sin llamar a nadie.
//
// Vive aparte de SettingsTab porque no es configuración del sistema sino contenido editorial
// —banners, anuncios, qué categorías se destacan— y porque tiene su propio ciclo de carga y
// guardado: los banners son registros con archivos, no claves de ajustes.
//
// Lo que se edita aquí solo lo ve el cliente final en /catalogo/<tienda>. Nada de esto afecta
// precios, inventario ni pedidos.

// Los temas que existen en el frontend (ver pages/catalogThemes/index.js). El servidor acepta
// cualquier nombre con forma válida y es el catálogo el que cae al estándar si no lo conoce,
// así que esta lista es solo para no obligar al comercio a escribirlo a mano.
const TEMAS = [
    { value: "", label: "Estándar" },
    { value: "boutique", label: "Tienda (con portada)" },
    { value: "menu", label: "Menú (por categorías)" },
];

const Card = ({ title, hint, children }) => (
    <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
        <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest block opacity-60">{title}</span>
        {hint && <p className="text-[9px] font-bold text-content-subtle dark:text-white/20 mt-1 mb-3 leading-relaxed">{hint}</p>}
        <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
);

const BANNER_VACIO = { title: "", alt_text: "", link_url: "", active: true };

// Colores sugeridos para la vitrina. No son una paleta cerrada —debajo hay un selector
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
// dejaría ese texto ilegible. El selector libre de abajo permite otro color igual, pero
// conviene que se mantenga oscuro.
const COLORES_FONDO = [
    ["#0A0A0A", "Negro"],
    ["#101922", "Azul noche"],
    ["#1A120B", "Café oscuro"],
    ["#0F1A14", "Verde oscuro"],
    ["#1F1B24", "Morado oscuro"],
];

export default function StorefrontSettings({ notify }) {
    const [settings, setSettings] = useState({});
    const [banners, setBanners] = useState([]);
    const [categories, setCategories] = useState([]);
    const [menu, setMenu] = useState([]);
    const [highlights, setHighlights] = useState([]);
    const [saving, setSaving] = useState(false);

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
            setSettings(s.data);
            setBanners(b.data);
            setCategories(c.data);
            // El menú se guarda como JSON en un ajuste. Un valor ilegible no puede dejar la
            // pantalla en blanco: se empieza de cero y al guardar se corrige solo.
            try { setMenu(JSON.parse(s.data.catalog_menu || "[]")); } catch { setMenu([]); }
            try { setHighlights(JSON.parse(s.data.catalog_highlights || "[]")); } catch { setHighlights([]); }
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const set = (key, value) => setSettings(p => ({ ...p, [key]: value }));

    const guardar = async () => {
        setSaving(true);
        try {
            // Solo las claves de vitrina: settings.update hace upsert de lo que reciba, así
            // que mandar el objeto entero reescribiría ajustes de otras pestañas con lo que
            // esta pantalla tenía cargado.
            await api.settings.update({
                catalog_theme: settings.catalog_theme || "",
                catalog_brand_color: settings.catalog_brand_color || "",
                catalog_panel_color: settings.catalog_panel_color || "",
                catalog_bg_color: settings.catalog_bg_color || "",
                catalog_announcement_text: settings.catalog_announcement_text || "",
                catalog_announcement_link: settings.catalog_announcement_link || "",
                catalog_instagram: settings.catalog_instagram || "",
                catalog_facebook: settings.catalog_facebook || "",
                catalog_menu: JSON.stringify(menu.filter(m => m.category_id)),
                catalog_highlights: JSON.stringify(highlights.map(h => h.trim()).filter(Boolean)),
            });
            notify("Vitrina guardada correctamente");
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    // ── Banners ──────────────────────────────────────────────────
    const abrirNuevo = () => { setEditing({ ...BANNER_VACIO }); setFiles({}); };
    const abrirEdicion = (b) => { setEditing({ ...b }); setFiles({}); };

    const guardarBanner = async () => {
        if (!editing.id && !files.image) return notify("Falta la imagen del banner", "err");
        try {
            const campos = {
                title: editing.title || "",
                alt_text: editing.alt_text || "",
                link_url: editing.link_url || "",
                active: editing.active,
                ...(editing.clear_mobile ? { clear_mobile: "true" } : {}),
            };
            if (editing.id) await api.catalogBanners.update(editing.id, campos, files);
            else await api.catalogBanners.create(campos, files);
            setEditing(null);
            setFiles({});
            await load();
            notify("Banner guardado correctamente");
        } catch (e) { notify(e.message, "err"); }
    };

    const eliminarBanner = async () => {
        try {
            await api.catalogBanners.remove(borrar.id);
            setBorrar(null);
            await load();
            notify("Banner eliminado");
        } catch (e) { notify(e.message, "err"); }
    };

    // Subir y bajar en vez de arrastrar: la vitrina se configura tanto desde una tablet como
    // desde el escritorio, y arrastrar con el dedo pelea con el desplazamiento de la página.
    const mover = async (index, delta) => {
        const destino = index + delta;
        if (destino < 0 || destino >= banners.length) return;
        const next = [...banners];
        [next[index], next[destino]] = [next[destino], next[index]];
        setBanners(next);
        try {
            await api.catalogBanners.reorder(next.map(b => b.id));
        } catch (e) {
            notify(e.message, "err");
            load(); // el orden de la pantalla ya no es el de la base
        }
    };

    const alternarActivo = async (b) => {
        try {
            await api.catalogBanners.update(b.id, {
                title: b.title || "", alt_text: b.alt_text || "",
                link_url: b.link_url || "", active: !b.active,
            }, {});
            await load();
        } catch (e) { notify(e.message, "err"); }
    };

    // ── Menú destacado ───────────────────────────────────────────
    const opcionesCategoria = [
        { value: "", label: "Elegir categoría..." },
        ...categories.map(c => ({ value: String(c.id), label: c.name })),
    ];

    const cambiarMenu = (i, campo, valor) =>
        setMenu(prev => prev.map((m, idx) => idx === i ? { ...m, [campo]: valor } : m));

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-3">
                {/* ── Carrusel ── */}
                <div className="bg-white dark:bg-surface-dark-3 rounded-xl p-4 border border-border/40 dark:border-white/10 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-content-subtle uppercase tracking-widest opacity-60">Carrusel de portada</span>
                        <Button onClick={abrirNuevo} className="h-7 px-3 text-[10px]">Agregar banner</Button>
                    </div>
                    <p className="text-[9px] font-bold text-content-subtle dark:text-white/20 mb-3 leading-relaxed">
                        Las imágenes grandes de la portada. El texto de la promoción va dentro de la
                        imagen: el sistema no escribe nada encima.
                    </p>

                    {banners.length === 0 ? (
                        <div className="py-8 text-center border-2 border-dashed border-border/40 dark:border-white/10 rounded-xl">
                            <p className="text-[11px] font-black text-content dark:text-white">Sin banners</p>
                            <p className="text-[9px] font-bold text-content-subtle uppercase tracking-widest mt-1">
                                La vitrina abre directo en los productos
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {banners.map((b, i) => (
                                <div key={b.id} className="flex items-center gap-3 p-2 rounded-xl border border-border/40 dark:border-white/10">
                                    <div className="w-24 h-14 shrink-0 rounded-lg overflow-hidden bg-surface-2 dark:bg-white/5">
                                        <img src={resolveImageUrl(b.image_url)} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-black text-content dark:text-white truncate">
                                            {b.title || "Sin nombre"}
                                        </p>
                                        <p className="text-[9px] font-bold text-content-subtle truncate">
                                            {b.link_url || "Sin enlace"}
                                        </p>
                                        {!b.image_mobile_url && (
                                            <p className="text-[9px] font-bold text-warning">Sin arte de móvil</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                                            className="w-7 h-7 rounded-lg border border-border/40 dark:border-white/10 flex items-center justify-center text-content-subtle disabled:opacity-30"
                                            title="Subir">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path d="M5 15l7-7 7 7" /></svg>
                                        </button>
                                        <button type="button" onClick={() => mover(i, 1)} disabled={i === banners.length - 1}
                                            className="w-7 h-7 rounded-lg border border-border/40 dark:border-white/10 flex items-center justify-center text-content-subtle disabled:opacity-30"
                                            title="Bajar">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        <button type="button" onClick={() => alternarActivo(b)}
                                            className={`h-7 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${b.active
                                                ? "border-success/30 text-success bg-success/5"
                                                : "border-border/40 dark:border-white/10 text-content-subtle"}`}>
                                            {b.active ? "Activo" : "Apagado"}
                                        </button>
                                        <button type="button" onClick={() => abrirEdicion(b)}
                                            className="w-7 h-7 rounded-lg border border-border/40 dark:border-white/10 flex items-center justify-center text-content-subtle"
                                            title="Editar">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button type="button" onClick={() => setBorrar(b)}
                                            className="w-7 h-7 rounded-lg border border-danger/30 text-danger flex items-center justify-center"
                                            title="Eliminar">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Menú destacado ── */}
                <Card
                    title="Menú destacado"
                    hint="Las categorías que aparecen en la barra superior de la vitrina, con su etiqueta opcional. Vacío = solo el buscador y los filtros de siempre."
                >
                    <div className="space-y-2">
                        {menu.map((m, i) => (
                            <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-center">
                                <CustomSelect
                                    value={String(m.category_id || "")}
                                    onChange={(v) => cambiarMenu(i, "category_id", v ? parseInt(v, 10) : "")}
                                    options={opcionesCategoria}
                                    height="h-9"
                                />
                                <input
                                    className="input h-9" placeholder="Texto (opcional)"
                                    value={m.label || ""}
                                    onChange={(e) => cambiarMenu(i, "label", e.target.value)}
                                />
                                <input
                                    className="input h-9" placeholder="Etiqueta"
                                    value={m.badge || ""}
                                    onChange={(e) => cambiarMenu(i, "badge", e.target.value)}
                                />
                                <button type="button" onClick={() => setMenu(prev => prev.filter((_, idx) => idx !== i))}
                                    className="w-9 h-9 rounded-lg border border-danger/30 text-danger flex items-center justify-center shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => setMenu(prev => [...prev, { category_id: "", label: "", badge: "" }])}
                            disabled={menu.length >= 10}
                            className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors disabled:opacity-40">
                            Agregar categoría al menú
                        </button>
                    </div>
                </Card>

                {/* ── Destacados de marca ──
                    El bloque corto entre el carrusel y los productos, del tipo "Expertos en
                    reparación · Anticaída · Crecimiento". Es lo que separa una vitrina con
                    cara de tienda de marca de una lista de productos cualquiera: unas pocas
                    palabras dicen en qué es buena la tienda antes de que el cliente empiece a
                    mirar precios. Solo el tema con portada lo usa. */}
                <Card
                    title="Destacados de marca"
                    hint="Frases muy cortas que presentan a la tienda, junto al eslogan de Empresa. Vacío = esa sección no se muestra."
                >
                    <div className="space-y-2">
                        {highlights.map((h, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <input
                                    className="input h-9" placeholder="Ej. Fórmulas naturales"
                                    maxLength={40}
                                    value={h}
                                    onChange={(e) => setHighlights(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                                />
                                <button type="button" onClick={() => setHighlights(prev => prev.filter((_, idx) => idx !== i))}
                                    className="w-9 h-9 rounded-lg border border-danger/30 text-danger flex items-center justify-center shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={() => setHighlights(prev => [...prev, ""])}
                            disabled={highlights.length >= 5}
                            className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors disabled:opacity-40">
                            Agregar frase
                        </button>
                    </div>
                </Card>

                <div className="flex justify-end">
                    <Button onClick={guardar} disabled={saving} className="h-8 px-6 text-[10px]">
                        {saving ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                <Card title="Diseño de la vitrina" hint="Cómo se ve el catálogo público de esta tienda.">
                    <CustomSelect
                        value={settings.catalog_theme || ""}
                        onChange={(v) => set("catalog_theme", v)}
                        options={TEMAS}
                        height="h-9"
                    />
                </Card>

                <Card
                    title="Color de la tienda"
                    hint="Solo afecta al catálogo público. El color del sistema se configura en Empresa y no cambia."
                >
                    <div className="grid grid-cols-5 gap-2 mb-3">
                        {COLORES.map(([hex, nombre]) => {
                            const activo = (settings.catalog_brand_color || "").toLowerCase() === hex.toLowerCase();
                            return (
                                <button
                                    key={hex}
                                    type="button"
                                    title={nombre}
                                    onClick={() => set("catalog_brand_color", hex)}
                                    className={`h-9 rounded-lg border-2 transition-all ${activo
                                        ? "border-content dark:border-white scale-105"
                                        : "border-transparent hover:scale-105"}`}
                                    style={{ backgroundColor: hex }}
                                />
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2.5">
                        <label className="relative shrink-0 cursor-pointer" title="Elegir otro color">
                            <span
                                className="block w-9 h-9 rounded-lg border border-border/40 dark:border-white/10 shadow-inner"
                                style={{ backgroundColor: settings.catalog_brand_color || "#ffffff" }}
                            />
                            <input
                                type="color"
                                value={settings.catalog_brand_color || "#E11D5C"}
                                onChange={(e) => set("catalog_brand_color", e.target.value)}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                        </label>
                        <input
                            className="input h-9 flex-1 font-mono uppercase"
                            placeholder="Sin elegir"
                            value={settings.catalog_brand_color || ""}
                            onChange={(e) => set("catalog_brand_color", e.target.value.trim())}
                        />
                    </div>

                    {settings.catalog_brand_color && (
                        <button
                            type="button"
                            onClick={() => set("catalog_brand_color", "")}
                            className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors mt-2"
                        >
                            Usar el color del sistema
                        </button>
                    )}
                </Card>

                {/* Los dos siguientes solo tienen efecto en el tema de menú. */}
                {settings.catalog_theme === "menu" && (
                    <Card
                        title="Color de fondo del menú"
                        hint="La página y la cabecera. El texto de arriba es blanco fijo, así que conviene mantenerlo oscuro."
                    >
                        <div className="grid grid-cols-5 gap-2 mb-3">
                            {COLORES_FONDO.map(([hex, nombre]) => {
                                const activo = (settings.catalog_bg_color || "").toLowerCase() === hex.toLowerCase();
                                return (
                                    <button
                                        key={hex}
                                        type="button"
                                        title={nombre}
                                        onClick={() => set("catalog_bg_color", hex)}
                                        className={`h-9 rounded-lg border-2 transition-all ${activo
                                            ? "border-content dark:border-white scale-105"
                                            : "border-border/40 dark:border-white/10 hover:scale-105"}`}
                                        style={{ backgroundColor: hex }}
                                    />
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2.5">
                            <label className="relative shrink-0 cursor-pointer" title="Elegir otro color">
                                <span
                                    className="block w-9 h-9 rounded-lg border border-border/40 dark:border-white/10 shadow-inner"
                                    style={{ backgroundColor: settings.catalog_bg_color || "#0A0A0A" }}
                                />
                                <input
                                    type="color"
                                    value={settings.catalog_bg_color || "#0A0A0A"}
                                    onChange={(e) => set("catalog_bg_color", e.target.value)}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                />
                            </label>
                            <input
                                className="input h-9 flex-1 font-mono uppercase"
                                placeholder="Sin elegir"
                                value={settings.catalog_bg_color || ""}
                                onChange={(e) => set("catalog_bg_color", e.target.value.trim())}
                            />
                        </div>

                        {settings.catalog_bg_color && (
                            <button
                                type="button"
                                onClick={() => set("catalog_bg_color", "")}
                                className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors mt-2"
                            >
                                Usar el tono por defecto
                            </button>
                        )}
                    </Card>
                )}

                {settings.catalog_theme === "menu" && (
                    <Card
                        title="Color del panel del menú"
                        hint="El fondo de la carta, donde van la foto de categoría y los platos. El texto de los platos es oscuro fijo: conviene mantenerlo claro."
                    >
                        <div className="grid grid-cols-5 gap-2 mb-3">
                            {COLORES_PANEL.map(([hex, nombre]) => {
                                const activo = (settings.catalog_panel_color || "").toLowerCase() === hex.toLowerCase();
                                return (
                                    <button
                                        key={hex}
                                        type="button"
                                        title={nombre}
                                        onClick={() => set("catalog_panel_color", hex)}
                                        className={`h-9 rounded-lg border-2 transition-all ${activo
                                            ? "border-content dark:border-white scale-105"
                                            : "border-border/40 dark:border-white/10 hover:scale-105"}`}
                                        style={{ backgroundColor: hex }}
                                    />
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-2.5">
                            <label className="relative shrink-0 cursor-pointer" title="Elegir otro color">
                                <span
                                    className="block w-9 h-9 rounded-lg border border-border/40 dark:border-white/10 shadow-inner"
                                    style={{ backgroundColor: settings.catalog_panel_color || "#ffffff" }}
                                />
                                <input
                                    type="color"
                                    value={settings.catalog_panel_color || "#F4FAF6"}
                                    onChange={(e) => set("catalog_panel_color", e.target.value)}
                                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                                />
                            </label>
                            <input
                                className="input h-9 flex-1 font-mono uppercase"
                                placeholder="Sin elegir"
                                value={settings.catalog_panel_color || ""}
                                onChange={(e) => set("catalog_panel_color", e.target.value.trim())}
                            />
                        </div>

                        {settings.catalog_panel_color && (
                            <button
                                type="button"
                                onClick={() => set("catalog_panel_color", "")}
                                className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-brand-500 transition-colors mt-2"
                            >
                                Usar el tono por defecto
                            </button>
                        )}
                    </Card>
                )}

                <Card
                    title="Barra de anuncio"
                    hint="La franja sobre la cabecera. Sin texto no se muestra."
                >
                    <input
                        className="input h-9 mb-2" placeholder="Ej: Envío gratis por compras mayores a $50"
                        value={settings.catalog_announcement_text || ""}
                        onChange={(e) => set("catalog_announcement_text", e.target.value)}
                        maxLength={160}
                    />
                    <input
                        className="input h-9" placeholder="Enlace (opcional)"
                        value={settings.catalog_announcement_link || ""}
                        onChange={(e) => set("catalog_announcement_link", e.target.value)}
                    />
                </Card>

                <Card title="Redes sociales" hint="Se muestran en el pie de la vitrina.">
                    <input
                        className="input h-9 mb-2" placeholder="https://instagram.com/tutienda"
                        value={settings.catalog_instagram || ""}
                        onChange={(e) => set("catalog_instagram", e.target.value)}
                    />
                    <input
                        className="input h-9" placeholder="https://facebook.com/tutienda"
                        value={settings.catalog_facebook || ""}
                        onChange={(e) => set("catalog_facebook", e.target.value)}
                    />
                </Card>
            </div>

            {/* ── Modal de banner ── */}
            <Modal
                open={!!editing}
                onClose={() => { setEditing(null); setFiles({}); }}
                title={editing?.id ? "Editar banner" : "Nuevo banner"}
                width={560}
            >
                {editing && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ImagePicker
                                label="Escritorio"
                                hint="Apaisada, ancha. Ej: 1920 × 720"
                                current={editing.image_url}
                                file={files.image}
                                onPick={(f) => setFiles(p => ({ ...p, image: f }))}
                            />
                            <ImagePicker
                                label="Móvil (opcional)"
                                hint="Casi cuadrada. Sin ella se usa la de escritorio."
                                current={editing.clear_mobile ? null : editing.image_mobile_url}
                                file={files.image_mobile}
                                onPick={(f) => setFiles(p => ({ ...p, image_mobile: f }))}
                                onClear={editing.image_mobile_url && !editing.clear_mobile
                                    ? () => setEditing(p => ({ ...p, clear_mobile: true }))
                                    : null}
                            />
                        </div>

                        <div>
                            <label className="label">Nombre interno</label>
                            <input className="input h-9" placeholder="Ej: Regreso a clases"
                                value={editing.title || ""}
                                onChange={(e) => setEditing(p => ({ ...p, title: e.target.value }))} />
                        </div>

                        <div>
                            <label className="label">Enlace al tocarlo (opcional)</label>
                            <input className="input h-9" placeholder="https://... o /catalogo/mi-tienda"
                                value={editing.link_url || ""}
                                onChange={(e) => setEditing(p => ({ ...p, link_url: e.target.value }))} />
                        </div>

                        <div>
                            <label className="label">Descripción de la imagen</label>
                            <input className="input h-9" placeholder="Qué dice el banner"
                                value={editing.alt_text || ""}
                                onChange={(e) => setEditing(p => ({ ...p, alt_text: e.target.value }))} />
                            <p className="text-[9px] font-bold text-content-subtle dark:text-white/20 mt-1 leading-relaxed">
                                Es lo que se lee si la imagen no carga, y lo único que reciben los clientes
                                que usan lector de pantalla: el mensaje de la promoción está dentro del arte.
                            </p>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!editing.active}
                                onChange={(e) => setEditing(p => ({ ...p, active: e.target.checked }))} />
                            <span className="text-[11px] font-black text-content dark:text-white">Mostrar en la vitrina</span>
                        </label>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="ghost" onClick={() => { setEditing(null); setFiles({}); }} className="h-8 px-4 text-[10px]">
                                Cancelar
                            </Button>
                            <Button onClick={guardarBanner} className="h-8 px-6 text-[10px]">Guardar</Button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!borrar}
                title="Eliminar banner"
                message={`Se elimina "${borrar?.title || "este banner"}" y su imagen. No se puede deshacer.`}
                confirmText="Eliminar"
                type="danger"
                onConfirm={eliminarBanner}
                onCancel={() => setBorrar(null)}
            />
        </div>
    );
}

// Selector de imagen con vista previa. Muestra la que ya está guardada hasta que se elige
// otra, y recién entonces la nueva: así se ve qué se va a reemplazar antes de guardar.
function ImagePicker({ label, hint, current, file, onPick, onClear }) {
    const preview = file ? URL.createObjectURL(file) : (current ? resolveImageUrl(current) : null);

    return (
        <div>
            <label className="label">{label}</label>
            <label className="cursor-pointer group block">
                <div className="w-full h-24 bg-surface-2 dark:bg-white/5 border-2 border-dashed border-border/40 dark:border-white/10 rounded-xl flex items-center justify-center overflow-hidden group-hover:border-brand-500/50 transition-all">
                    {preview
                        ? <img src={preview} alt="" className="w-full h-full object-cover" />
                        : <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest">Subir imagen</span>}
                </div>
                <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files[0] && onPick(e.target.files[0])} />
            </label>
            <div className="flex items-center justify-between mt-1">
                <p className="text-[9px] font-bold text-content-subtle dark:text-white/20">{hint}</p>
                {onClear && (
                    <button type="button" onClick={onClear}
                        className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-danger transition-colors">
                        Quitar
                    </button>
                )}
            </div>
        </div>
    );
}
