// Compra desde foto (Asta, 23-11-2026). Se toma la foto de la factura, nota de entrega o ticket
// del proveedor; Asta la lee (services/asistente/lectorCompra.js en el backend) y propone las
// líneas cruzadas con el catálogo. Aquí se revisa todo y "Pasar a la orden" llena el formulario
// de compra de siempre: la orden se guarda como borrador con su botón, nunca sola, y la
// mercancía solo entra al recibirla.
//
// Lo que enseñó la prueba con facturas reales: la foto tiene que ir DERECHA (girada, la lectura
// se enreda), el proveedor a veces ni sale en la foto ("Razón social" suele ser el comprador) y
// hay que comparar la suma de las líneas con el total impreso. Por eso el paso de fotos tiene
// "Girar" y la revisión, el cuadre arriba.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import ProductModal from "../ProductModal";
import { Robot } from "../asistente/Asistente";
import { PKG_UNITS } from "../../constants/pkg";
import { calcMargin, calcPurchaseItem, toNameCase } from "../../helpers";
import { useFactorIva } from "../../hooks/useFactorIva";
import { monedaLocal } from "../../helpers/currency";
import { unidadCorta } from "../warehouses/movementMeta";

const MAX_FOTOS = 4;
const LADO_MAX = 1800;      // px: de sobra para leer el texto, y la foto viaja liviana
// Alta a propósito: con 0,85 un ticket arrugado perdió un dígito (leyó 36.855 en vez de 36.655).
// Aun así la foto pesa unos 200–400 KB.
const CALIDAD = 0.92;
const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const limpiarNum = (raw) => {
    let v = String(raw).replace(/[^\d.,]/g, "").replace(",", ".");
    const i = v.indexOf(".");
    return i === -1 ? v : v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
};
const fechaVE = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const conGuion = (rif) => {
    const s = String(rif || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return /^[VEJGP]\d+$/.test(s) ? `${s[0]}-${s.slice(1)}` : s;
};

const TIPOS = { factura: "Factura", nota_entrega: "Nota de entrega", orden_entrega: "Orden de entrega", ticket_fiscal: "Ticket fiscal" };
const COMO = { codigo: "Por código", aprendido: "Ya lo conoce", nombre: "Por nombre" };
const PENSANDO = ["Leyendo el documento…", "Leyendo cada línea…", "Buscando los productos en tu catálogo…", "Revisando que todo cuadre…"];

// ── Fotos ──────────────────────────────────────────────────────────────────────

const cargarImagen = (src) => new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("No se pudo abrir la imagen"));
    img.src = src;
});

// Achica la foto del teléfono (4000 px, 5 MB) a algo que viaja rápido y se sigue leyendo bien.
// El navegador ya la endereza según la orientación que guardó la cámara.
async function prepararFoto(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await cargarImagen(url);
        const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", CALIDAD);
    } finally {
        URL.revokeObjectURL(url);
    }
}

// El giro se aplica una sola vez, al enviar: girar y volver a comprimir en cada toque gastaba
// calidad. En pantalla se muestra con CSS.
async function fotoGirada(src, giro) {
    if (!giro) return src;
    const img = await cargarImagen(src);
    const c = document.createElement("canvas");
    const recto = giro % 2 === 1;
    c.width = recto ? img.naturalHeight : img.naturalWidth;
    c.height = recto ? img.naturalWidth : img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((giro * Math.PI) / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return c.toDataURL("image/jpeg", CALIDAD);
}

// ── Líneas ─────────────────────────────────────────────────────────────────────

// La presentación que trae el papel, llevada a la lista del sistema.
function presentacion(u) {
    const s = String(u || "").toUpperCase();
    if (/^CAJA/.test(s)) return "CAJA";
    if (/^BULTO/.test(s)) return "BULTO";
    if (/^DISPL/.test(s)) return "DISPLAY";
    if (/^PAQ/.test(s)) return "PAQUETE";
    if (/^FARDO/.test(s)) return "FARDO";
    if (/^SACO/.test(s)) return "SACO";
    if (/^DOC/.test(s)) return "DOCENA";
    return "UNIDAD";
}

function lineaInicial(l) {
    let unidad, tamano;
    if (l.empaque) {
        // Ya se compró antes: se repite como se cargó esa vez.
        unidad = l.empaque.unidad || "UNIDAD";
        tamano = l.empaque.tamano || 1;
    } else {
        unidad = presentacion(l.unidad);
        tamano = l.unidades_por_empaque;
        // "KERAMIX X12U" a 4.185: es un paquete de 12 aunque el papel no diga "paquete".
        if (unidad === "UNIDAD" && tamano > 1) unidad = "PAQUETE";
        if (unidad === "UNIDAD") tamano = 1;
        else if (!tamano && l.producto && String(l.producto.package_unit || "").toUpperCase() === unidad) tamano = l.producto.package_size;
    }
    return {
        n: l.n,
        descripcion: l.descripcion,
        incluir: true,
        producto: l.producto || null,
        como: l.como || null,
        alternativas: l.alternativas || [],
        qty: l.cantidad != null ? String(l.cantidad) : "",
        unidad,
        tamano: tamano ? String(tamano) : "",
        costo: l.costo_empaque ? String(Math.round(l.costo_empaque * 10000) / 10000) : "",
        total_papel: l.total,
        revisar: !!l.revisar,
        margen: null,      // null = el del producto (margenDefecto); "" = no tocar el precio de venta
    };
}

const lista = (l) => l.producto && num(l.qty) > 0 && num(l.tamano) > 0 && num(l.costo) > 0;
const nombreLimpio = (d) => String(d || "").replace(/\((E|G)\)|\*+/g, " ").replace(/\s+/g, " ").trim();

// ── Elegir producto de una línea ───────────────────────────────────────────────

function BuscarProducto({ inicial, onElegir, onCrear, onCerrar }) {
    const [texto, setTexto] = useState(inicial);
    const [res, setRes] = useState([]);
    const [cargando, setCargando] = useState(false);
    useEffect(() => {
        let vivo = true;
        const t = setTimeout(async () => {
            if (!texto.trim()) { setRes([]); return; }
            setCargando(true);
            try {
                const r = await api.products.getAll({ search: texto.trim(), limit: 8, is_combo: false, is_service: false });
                if (vivo) setRes((r.data || r || []).filter(p => !p.is_variant_parent));
            } catch { if (vivo) setRes([]); }
            if (vivo) setCargando(false);
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [texto]);

    return (
        <div className="mt-2 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.03] p-2">
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={texto} onChange={e => setTexto(e.target.value)} data-autofocus autoFocus
                    placeholder="Buscar en tu catálogo…" autoComplete="off" spellCheck={false}
                    className="input h-10 pl-9 pr-9 text-[13px]" />
                {cargando && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
            </div>
            <div className="mt-1 max-h-56 overflow-y-auto">
                {res.map(p => (
                    <button key={p.id} type="button" onClick={() => onElegir(p)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors">
                        <div className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</div>
                        <div className="text-[12px] text-content-subtle tabular-nums">
                            {p.cost_price > 0 ? `Último costo Ref. ${fmt2(p.cost_price)}` : "Sin costo registrado"}{p.barcode ? ` · ${p.barcode}` : ""}
                        </div>
                    </button>
                ))}
                {!cargando && texto.trim() && !res.length && (
                    <p className="px-3 py-2 text-[12px] text-content-subtle">Nada coincide con “{texto.trim()}”.</p>
                )}
            </div>
            <div className="flex items-center gap-2 border-t border-border/60 dark:border-white/[0.06] mt-1 pt-2">
                <button type="button" onClick={() => onCrear(texto.trim())}
                    className="h-9 px-3 rounded-lg text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                    Crear producto nuevo
                </button>
                <button type="button" onClick={onCerrar} className="ml-auto h-9 px-3 rounded-lg text-[13px] text-content-subtle hover:text-content dark:hover:text-white">Cerrar</button>
            </div>
        </div>
    );
}

// ── Pantalla ───────────────────────────────────────────────────────────────────

export default function CompraDesdeFoto({ open, onClose, state, notify }) {
    const { activeCurrencies, baseCurrency } = useApp();
    const factorIva = useFactorIva();
    const local = monedaLocal(activeCurrencies);

    const [paso, setPaso] = useState("fotos");
    const [fotos, setFotos] = useState([]);
    const [error, setError] = useState("");
    const [doc, setDoc] = useState(null);
    const [lineas, setLineas] = useState([]);
    const [tasa, setTasa] = useState("");
    const [segundos, setSegundos] = useState(0);
    const [buscando, setBuscando] = useState(null);       // n de la línea con el buscador abierto
    const [creando, setCreando] = useState(null);         // { n, nombre }
    const [categorias, setCategorias] = useState([]);
    const [guardandoNuevo, setGuardandoNuevo] = useState(false);
    const [verDudas, setVerDudas] = useState(false);
    const [margenTodas, setMargenTodas] = useState("");
    const pedido = useRef(0);
    const inputCamara = useRef(null);
    const inputGaleria = useRef(null);

    useEffect(() => {
        if (!open) return;
        setPaso("fotos"); setFotos([]); setError(""); setDoc(null); setLineas([]); setTasa("");
        setBuscando(null); setCreando(null); setVerDudas(false); setMargenTodas("");
    }, [open]);

    // Reloj y frases mientras lee: tarda de 10 a 60 segundos y sin señales parece colgado.
    useEffect(() => {
        if (paso !== "leyendo") return;
        setSegundos(0);
        const t = setInterval(() => setSegundos(s => s + 1), 1000);
        return () => clearInterval(t);
    }, [paso]);

    const agregarArchivos = async (files) => {
        setError("");
        const nuevos = [];
        for (const f of Array.from(files || [])) {
            if (!f.type.startsWith("image/")) continue;
            if (fotos.length + nuevos.length >= MAX_FOTOS) { setError(`Máximo ${MAX_FOTOS} fotos por documento.`); break; }
            try { nuevos.push({ id: `${Date.now()}-${Math.random()}`, src: await prepararFoto(f), giro: 0 }); }
            catch { setError("Una de las imágenes no se pudo abrir."); }
        }
        if (nuevos.length) setFotos(prev => [...prev, ...nuevos]);
    };

    const leer = async () => {
        if (!fotos.length) return;
        setError("");
        setPaso("leyendo");
        const mio = ++pedido.current;
        try {
            const imagenes = await Promise.all(fotos.map(f => fotoGirada(f.src, f.giro)));
            const r = await api.asistente.leerCompra(imagenes);
            if (mio !== pedido.current) return;
            const d = r.data;
            setDoc(d);
            setLineas(d.lineas.map(lineaInicial));
            setTasa(d.moneda === "VES" ? String(d.tasa || local?.exchange_rate || "") : "");
            // Proveedor encontrado por RIF o nombre: queda elegido de una vez.
            if (d.proveedor_sugerido && !state.selectedSupplier) state.selectSupplier(d.proveedor_sugerido);
            setPaso("revision");
        } catch (e) {
            if (mio !== pedido.current) return;
            setError(e.code === "TIMEOUT" ? "La lectura tardó demasiado. Prueba con una foto más nítida o divide el documento en varias fotos." : e.message);
            setPaso("fotos");
        }
    };

    const cerrar = () => { pedido.current++; onClose(); };

    const cambiar = (n, cambios) => setLineas(prev => prev.map(l => (l.n === n ? { ...l, ...cambios } : l)));

    // Margen con que entra cada línea. El que tenga guardado el producto; si no tiene, el que
    // hoy deja su precio sobre su último costo, para que el precio siga la misma proporción con
    // el costo nuevo. El 30 fijo de antes le subía el precio a quien vendía con otro margen
    // (pasó el 24-11: una clienta vio sus productos al 30 %). Solo sin precio ni costo, 30.
    const margenDefecto = (p) => {
        if (!p || p.sellable === false) return "";
        if (p.profit_margin != null) return String(p.profit_margin);
        const m = calcMargin(p.price, p.cost_price, factorIva(p));
        return m != null && m >= 0 ? String(m) : "30";
    };
    const margenDe = (l) => (l.producto?.sellable === false ? "" : (l.margen ?? margenDefecto(l.producto)));
    const aplicarMargenTodas = () => {
        if (String(margenTodas).trim() === "") return;
        setLineas(prev => prev.map(l => (l.producto?.sellable === false ? l : { ...l, margen: margenTodas })));
    };
    const asignar = (n, p) => {
        setLineas(prev => prev.map(l => {
            if (l.n !== n) return l;
            const prod = {
                id: p.id, name: p.name, barcode: p.barcode || null, unit: p.unit, sellable: p.sellable !== false,
                package_unit: p.package_unit || null, package_size: p.package_size != null ? parseFloat(p.package_size) : null,
                cost_price: p.cost_price != null ? parseFloat(p.cost_price) : null,
                profit_margin: p.profit_margin != null ? parseFloat(p.profit_margin) : null,
                price: p.price != null ? parseFloat(p.price) : null, iva_tipo: p.iva_tipo, piece_mode: p.piece_mode || null,
            };
            const tamano = !num(l.tamano) && String(prod.package_unit || "").toUpperCase() === l.unidad && prod.package_size ? String(prod.package_size) : l.tamano;
            return { ...l, producto: prod, como: "manual", tamano, margen: null };
        }));
        setBuscando(null);
    };

    const abrirCrear = async (n, nombre) => {
        if (!categorias.length) {
            try { const r = await api.categories.getAll(); setCategorias(r.data || []); } catch { /* sin categorías el alta sigue sirviendo */ }
        }
        setBuscando(null);
        setCreando({ n, nombre });
    };
    const productoCreado = async (form, imageFile) => {
        setGuardandoNuevo(true);
        let creado = null;
        try {
            const r = await api.products.create(form, imageFile);
            creado = r.data || r;
            asignar(creando.n, creado);
            setCreando(null);
        } catch (e) { notify?.(e.message, "err"); }
        setGuardandoNuevo(false);
        return creado;
    };

    // ── Cálculos de la revisión ──
    const enBs = doc?.moneda === "VES";
    const sym = enBs ? (local?.symbol || "Bs.") : (baseCurrency?.symbol || "Ref.");
    const tasaNum = num(tasa);
    const incluidas = lineas.filter(l => l.incluir);
    const listas = incluidas.filter(lista);
    const faltan = incluidas.length - listas.length;
    const totalDoc = incluidas.reduce((a, l) => a + num(l.qty) * num(l.costo), 0);
    const yaEnOrden = useMemo(() => new Set((state.items || []).map(i => i.product?.id ?? i.product_id)), [state.items]);
    const sinTasa = enBs && !(tasaNum > 0);
    const puedePasar = incluidas.length > 0 && faltan === 0 && !sinTasa;

    const pasarALaOrden = () => {
        if (!puedePasar) return;
        // Dos líneas del papel que son el mismo producto y el mismo empaque van juntas en la orden.
        const grupos = new Map();
        for (const l of listas) {
            const k = `${l.producto.id}|${l.unidad}|${num(l.tamano)}`;
            const g = grupos.get(k);
            if (g) { g.qty += num(l.qty); g.total += num(l.qty) * num(l.costo); }
            else grupos.set(k, { l, qty: num(l.qty), total: num(l.qty) * num(l.costo) });
        }
        let saltadas = 0;
        let i = 0;
        for (const { l, qty, total } of grupos.values()) {
            const p = l.producto;
            if (yaEnOrden.has(p.id)) { saltadas++; continue; }
            const costoBase = (total / qty) / (enBs ? tasaNum : 1);
            const base = {
                product: p,
                package_unit: l.unidad,
                package_size: String(num(l.tamano)),
                package_qty: String(qty),
                package_price: String(costoBase),
                profit_margin: margenDe(l),
                lot_number: "",
                expiration_date: "",
            };
            const calc = calcPurchaseItem(base, factorIva(p));
            const item = { ...base, ...calc, key: Date.now() + i++ };
            if (p.sellable === false) { item.sale_price = null; item.keepsPrice = true; }
            item.update_price = !(p.sellable === false || item.keepsPrice);
            state.addItemFromModal(item);
        }

        // Moneda y tasa de la factura: los costos se guardan en Ref. y la orden recuerda a cuánto se compró.
        if (enBs && local) { state.selectInvoiceCurrency(local); state.setInvoiceRateInput(String(tasaNum)); }
        else if (!enBs) state.selectInvoiceCurrency(null);

        // Referencia del documento en las notas.
        const d = doc.documento || {};
        const ref = [
            `${TIPOS[doc.tipo] || "Documento"}${d.numero ? ` ${d.numero}` : ""}`,
            d.numero_control ? `Control ${d.numero_control}` : null,
            d.fecha ? fechaVE(d.fecha) : null,
        ].filter(Boolean).join(" · ");
        state.setNotes(prev => (prev ? `${prev} · ${ref}` : ref).slice(0, 500));

        // Sin proveedor elegido: el buscador del formulario queda con el nombre leído, que ofrece
        // "Crear proveedor" si no existe.
        if (!state.selectedSupplier && doc.emisor?.nombre) state.setSupplierSearch(doc.emisor.nombre);

        // Lo que la tienda confirmó se recuerda: la próxima factura de este proveedor ya sale emparejada.
        api.asistente.compraAlias(listas.map(l => ({
            descripcion: l.descripcion, product_id: l.producto.id, package_unit: l.unidad, package_size: num(l.tamano),
        }))).catch(() => {});

        const agregadas = grupos.size - saltadas;
        notify?.(`Asta pasó ${agregadas} ${agregadas === 1 ? "producto" : "productos"} a la orden${saltadas ? ` (${saltadas} ya estaban)` : ""}. Revisa y guarda el borrador.`);
        onClose();
    };

    // ── Render ──
    const titulo = paso === "revision" ? "Revisa lo que leyó Asta" : "Cargar compra desde foto";

    const pie = paso === "fotos" ? (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            <p className="text-[12px] text-content-subtle sm:mr-auto">Leer un documento gasta 5 consultas de Asta.</p>
            <button type="button" onClick={cerrar} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            {fotos.length > 0 && (
                <button type="button" onClick={leer} className="btn-accent h-12 sm:h-10 px-5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2">
                    <Robot className="w-4 h-4" parpadea={false} />
                    Leer {fotos.length === 1 ? "la foto" : `las ${fotos.length} fotos`}
                </button>
            )}
        </div>
    ) : paso === "revision" ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="sm:mr-auto min-w-0">
                <div className="text-[12px] text-content-subtle">
                    {faltan > 0
                        ? `Falta elegir el producto o completar ${faltan} ${faltan === 1 ? "línea" : "líneas"}`
                        : sinTasa ? "Escribe la tasa de la factura" : `${listas.length} ${listas.length === 1 ? "línea lista" : "líneas listas"}`}
                </div>
                <div className="text-[18px] font-bold tracking-tight text-content dark:text-white tabular-nums">
                    {sym} {fmt2(totalDoc)}
                    {enBs && tasaNum > 0 && <span className="ml-2 text-[12px] font-medium text-content-subtle">≈ Ref. {fmt2(totalDoc / tasaNum)}</span>}
                </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button type="button" onClick={() => { setPaso("fotos"); setError(""); }} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Volver a las fotos</button>
                <button type="button" onClick={pasarALaOrden} disabled={!puedePasar}
                    className="btn-accent h-12 sm:h-10 px-5 rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:pointer-events-none">
                    Pasar a la orden
                </button>
            </div>
        </div>
    ) : null;

    return (
        <>
            <Modal open={open} onClose={cerrar} title={titulo} width={paso === "revision" ? 880 : 620} footer={pie}>
                {paso === "fotos" && (
                    <div className="space-y-4">
                        <p className="text-[13px] text-content-subtle leading-relaxed">
                            Toma la foto de la factura, nota de entrega o ticket del proveedor. Asta lee los productos, los busca en tu catálogo
                            y arma la orden. Tú revisas todo antes de guardar.
                        </p>

                        {error && <div className="pl-3 border-l-[3px] border-danger text-[13px] text-danger">{error}</div>}

                        {fotos.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {fotos.map((f, i) => (
                                    <div key={f.id} className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden bg-surface-2 dark:bg-white/[0.03]">
                                        <div className="relative aspect-[3/4] overflow-hidden flex items-center justify-center">
                                            <img src={f.src} alt={`Foto ${i + 1}`}
                                                className="max-w-full max-h-full object-contain transition-transform duration-200"
                                                style={{ transform: `rotate(${f.giro * 90}deg)${f.giro % 2 ? " scale(0.75)" : ""}` }} />
                                            <span className="absolute top-1.5 left-1.5 min-w-5 h-5 px-1.5 rounded-full bg-black/60 text-white text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                                        </div>
                                        <div className="flex border-t border-border/60 dark:border-white/[0.06]">
                                            <button type="button" onClick={() => setFotos(prev => prev.map(x => (x.id === f.id ? { ...x, giro: (x.giro + 1) % 4 } : x)))}
                                                className="flex-1 h-10 text-[12px] font-medium text-content dark:text-white hover:bg-surface-3 dark:hover:bg-white/[0.05] flex items-center justify-center gap-1.5">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 12a8 8 0 10-2.3 5.7M4.6 9A8 8 0 0120 12" /></svg>
                                                Girar
                                            </button>
                                            <button type="button" onClick={() => setFotos(prev => prev.filter(x => x.id !== f.id))}
                                                className="w-10 h-10 border-l border-border/60 dark:border-white/[0.06] text-content-subtle hover:text-danger flex items-center justify-center" title="Quitar foto" aria-label="Quitar foto">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {fotos.length < MAX_FOTOS && (
                            <div
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); agregarArchivos(e.dataTransfer.files); }}
                                className="rounded-xl border-2 border-dashed border-border dark:border-white/10 px-4 py-6 flex flex-col items-center text-center">
                                <div className="w-11 h-11 rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/70 dark:border-white/[0.08] flex items-center justify-center text-content-subtle">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.9l.82-1.2A2 2 0 0110.07 4h3.86a2 2 0 011.66.9l.82 1.2a2 2 0 001.66.9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </div>
                                <p className="mt-3 text-[14px] font-semibold text-content dark:text-white">
                                    {fotos.length ? "¿El documento sigue? Agrega otra foto" : "Agrega la foto del documento"}
                                </p>
                                <p className="mt-1 text-[12px] text-content-subtle max-w-sm">
                                    Derecha (que el texto se lea sin girar la cabeza), completa y con buena luz. Si es largo, toma varias fotos de arriba a abajo.
                                </p>
                                <div className="mt-4 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                    <button type="button" onClick={() => inputCamara.current?.click()}
                                        className={`lg:hidden ${fotos.length ? "btn-outline font-medium" : "btn-accent font-semibold"} h-12 sm:h-10 px-4 rounded-lg text-[13px]`}>
                                        {fotos.length ? "Tomar otra foto" : "Tomar foto"}
                                    </button>
                                    <button type="button" onClick={() => inputGaleria.current?.click()}
                                        className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">
                                        <span className="lg:hidden">Elegir de la galería</span>
                                        <span className="hidden lg:inline">Elegir fotos o arrastrarlas aquí</span>
                                    </button>
                                </div>
                                <input ref={inputCamara} type="file" accept="image/*" capture="environment" className="hidden"
                                    onChange={e => { agregarArchivos(e.target.files); e.target.value = ""; }} />
                                <input ref={inputGaleria} type="file" accept="image/*" multiple className="hidden"
                                    onChange={e => { agregarArchivos(e.target.files); e.target.value = ""; }} />
                            </div>
                        )}
                    </div>
                )}

                {paso === "leyendo" && (
                    <div className="py-12 flex flex-col items-center text-center" aria-live="polite">
                        <span className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center bot-float">
                            <Robot className="w-9 h-9" />
                        </span>
                        <p className="mt-5 text-[15px] font-semibold text-content dark:text-white">{PENSANDO[Math.floor(segundos / 4) % PENSANDO.length]}</p>
                        <p className="mt-1 text-[13px] text-content-subtle tabular-nums">{segundos} s · suele tardar entre 10 y 60 segundos</p>
                        <button type="button" onClick={() => { pedido.current++; setPaso("fotos"); }}
                            className="mt-6 h-10 px-4 rounded-lg text-[13px] text-content-subtle hover:text-content dark:hover:text-white">Cancelar</button>
                    </div>
                )}

                {paso === "revision" && doc && (
                    <div className="space-y-4">
                        {/* Documento */}
                        <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] p-4">
                            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-[13px]">
                                <div className="min-w-0">
                                    <dt className="text-[12px] text-content-subtle">{TIPOS[doc.tipo] || "Documento"}</dt>
                                    <dd className="mt-0.5 font-medium text-content dark:text-white tabular-nums truncate">
                                        {doc.documento?.numero ? `N° ${doc.documento.numero}` : "Sin número"}
                                        {doc.documento?.numero_control && <span className="block text-[12px] font-normal text-content-subtle">Control {doc.documento.numero_control}</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[12px] text-content-subtle">Fecha</dt>
                                    <dd className="mt-0.5 font-medium text-content dark:text-white tabular-nums">{doc.documento?.fecha ? fechaVE(doc.documento.fecha) : "No se lee"}</dd>
                                </div>
                                <div className="col-span-2 lg:col-span-1 min-w-0">
                                    <dt className="text-[12px] text-content-subtle">Proveedor</dt>
                                    <dd className="mt-0.5 min-w-0">
                                        {state.selectedSupplier ? (
                                            <span className="flex items-center gap-1.5 font-medium text-content dark:text-white">
                                                <svg className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                <span className="truncate">{toNameCase(state.selectedSupplier.name)}</span>
                                            </span>
                                        ) : doc.emisor?.nombre ? (
                                            <>
                                                <span className="block font-medium text-content dark:text-white truncate">{doc.emisor.nombre}</span>
                                                <span className="block text-[12px] text-content-subtle">
                                                    {doc.emisor.rif ? `${conGuion(doc.emisor.rif)} · ` : ""}no está registrado ·{" "}
                                                    <button type="button" onClick={() => state.openCreateSupplier(doc.emisor.nombre, conGuion(doc.emisor.rif))}
                                                        className="font-medium text-brand-700 dark:text-brand-300 hover:underline">Registrarlo</button>
                                                </span>
                                            </>
                                        ) : (
                                            <span className="block text-content-subtle">No sale en la foto: lo eliges en la orden</span>
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[12px] text-content-subtle">{enBs ? "Precios en bolívares" : "Precios en dólares"}</dt>
                                    <dd className="mt-0.5">
                                        {enBs ? (
                                            <div className="relative max-w-[180px]">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Tasa</span>
                                                <input value={tasa} onChange={e => setTasa(limpiarNum(e.target.value))} inputMode="decimal" autoComplete="off"
                                                    className={`input h-9 pl-11 text-right text-[13px] tabular-nums ${sinTasa ? "!border-danger" : ""}`} />
                                            </div>
                                        ) : <span className="font-medium text-content dark:text-white">Sin conversión</span>}
                                        {enBs && doc.tasa_calculada && <span className="block mt-1 text-[11px] text-content-subtle">Sale de dividir el total entre el REF</span>}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        {/* ¿Cuadra con el papel? */}
                        {doc.cuadre ? (
                            doc.cuadre.cuadra ? (
                                <div className="flex items-start gap-2 text-[13px] text-content dark:text-white">
                                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    <span>Las líneas suman {sym} {fmt2(doc.cuadre.suma)}, igual al {doc.cuadre.etiqueta} del documento.</span>
                                </div>
                            ) : (
                                <div className="pl-3 border-l-[3px] border-danger text-[13px] text-content dark:text-white">
                                    <span className="font-semibold text-danger">No cuadra: </span>
                                    las líneas suman {sym} {fmt2(doc.cuadre.suma)} y el {doc.cuadre.etiqueta} del documento dice {sym} {fmt2(doc.cuadre.objetivo)}
                                    {" "}(diferencia {sym} {fmt2(Math.abs(doc.cuadre.diferencia))}). Revisa las líneas contra el papel
                                    {" "}o{" "}
                                    <button type="button" onClick={leer} className="font-medium text-brand-700 dark:text-brand-300 hover:underline">léelo de nuevo</button>
                                    {" "}(otras 5 consultas): a veces un número arrugado sale distinto.
                                </div>
                            )
                        ) : (
                            <div className="pl-3 border-l-[3px] border-amber-500 text-[13px] text-content dark:text-white">
                                El documento no trae un total que se pueda comparar: revisa cantidades y costos contra el papel.
                            </div>
                        )}

                        {doc.dudas?.length > 0 && (
                            <div>
                                <button type="button" onClick={() => setVerDudas(v => !v)} className="text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white flex items-center gap-1">
                                    <svg className={`w-3 h-3 transition-transform ${verDudas ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" /></svg>
                                    Asta anotó {doc.dudas.length} {doc.dudas.length === 1 ? "duda" : "dudas"} al leer
                                </button>
                                {verDudas && (
                                    <ul className="mt-2 space-y-1 text-[12px] text-content-subtle list-disc pl-5">
                                        {doc.dudas.map((d, i) => <li key={i}>{d}</li>)}
                                    </ul>
                                )}
                            </div>
                        )}

                        {/* Margen de todas las líneas de una vez */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="text-[13px] text-content dark:text-white sm:mr-auto">
                                Margen de ganancia
                                <span className="block text-[12px] text-content-subtle">Cada línea trae el de su producto. Puedes cambiarlo en la línea o ponerlo a todas.</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="relative w-28">
                                    <input value={margenTodas} onChange={e => setMargenTodas(limpiarNum(e.target.value))}
                                        onKeyDown={e => { if (e.key === "Enter") aplicarMargenTodas(); }}
                                        inputMode="decimal" autoComplete="off" placeholder="30" aria-label="Margen para todas las líneas"
                                        className="input h-10 pr-8 text-right text-[13px] font-semibold tabular-nums" />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                </span>
                                <button type="button" onClick={aplicarMargenTodas} disabled={String(margenTodas).trim() === ""}
                                    className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none">
                                    Poner a todas
                                </button>
                            </div>
                        </div>

                        {/* Líneas */}
                        <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {lineas.map(l => {
                                const totalLinea = num(l.qty) * num(l.costo);
                                const unidades = num(l.qty) * num(l.tamano);
                                const ok = lista(l);
                                const repetido = l.producto && yaEnOrden.has(l.producto.id);
                                const vendible = l.producto?.sellable !== false;
                                const margen = margenDe(l);
                                const costoRef = num(l.costo) > 0 && num(l.tamano) > 0 && (!enBs || tasaNum > 0)
                                    ? num(l.costo) / num(l.tamano) / (enBs ? tasaNum : 1) : 0;
                                const precioVenta = l.producto && vendible && costoRef > 0 && String(margen).trim() !== ""
                                    ? costoRef * (1 + num(margen) / 100) * factorIva(l.producto) : null;
                                return (
                                    <div key={l.n} className={`px-4 py-3 ${!l.incluir ? "opacity-55" : ""} ${l.incluir && !ok ? "border-l-[3px] border-l-amber-500" : ""}`}>
                                        <div className="flex items-start gap-3">
                                            <Check checked={l.incluir} onChange={v => cambiar(l.n, { incluir: v })} title={l.incluir ? "No cargar esta línea" : "Cargar esta línea"} className="mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-[12px] text-content-subtle">En el papel</div>
                                                        <div className="text-[13px] font-semibold text-content dark:text-white break-words">{l.descripcion}</div>
                                                    </div>
                                                    {l.incluir && (
                                                        <div className="text-right shrink-0 tabular-nums">
                                                            <div className="text-[14px] font-semibold text-content dark:text-white">{sym} {fmt2(totalLinea)}</div>
                                                            {enBs && tasaNum > 0 && <div className="text-[11px] text-content-subtle">Ref. {fmt2(totalLinea / tasaNum)}</div>}
                                                        </div>
                                                    )}
                                                </div>

                                                {l.incluir && (
                                                    <>
                                                        {/* Producto del catálogo */}
                                                        <div className="mt-2">
                                                            {l.producto ? (
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                                                                    <svg className="w-3.5 h-3.5 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                                                    <span className="font-medium text-content dark:text-white">{l.producto.name}</span>
                                                                    {COMO[l.como] && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-3 dark:bg-white/[0.06] text-content-subtle">{COMO[l.como]}</span>}
                                                                    {repetido && <span className="text-[11px] text-amber-700 dark:text-amber-400">Ya está en la orden: no se agrega de nuevo</span>}
                                                                    <button type="button" onClick={() => setBuscando(buscando === l.n ? null : l.n)} className="text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:underline">Cambiar</button>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    <div className="text-[13px] font-medium text-amber-700 dark:text-amber-400">¿Qué producto de tu catálogo es?</div>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {l.alternativas.map(a => (
                                                                            <button key={a.id} type="button" onClick={() => asignar(l.n, a)}
                                                                                className="h-8 px-2.5 rounded-lg border border-border dark:border-white/10 text-[12px] font-medium text-content dark:text-white hover:border-brand-500 hover:bg-brand-500/5 max-w-full truncate">
                                                                                {a.name}
                                                                            </button>
                                                                        ))}
                                                                        <button type="button" onClick={() => setBuscando(buscando === l.n ? null : l.n)}
                                                                            className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10">Buscar otro</button>
                                                                        <button type="button" onClick={() => abrirCrear(l.n, nombreLimpio(l.descripcion))}
                                                                            className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10">Crear producto</button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {buscando === l.n && (
                                                                <BuscarProducto
                                                                    inicial={nombreLimpio(l.descripcion).split(" ").slice(0, 2).join(" ")}
                                                                    onElegir={p => asignar(l.n, p)}
                                                                    onCrear={t => abrirCrear(l.n, t || nombreLimpio(l.descripcion))}
                                                                    onCerrar={() => setBuscando(null)}
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Cómo viene y a cuánto */}
                                                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                                                            <label className="flex flex-col gap-1">
                                                                <span className="text-[12px] text-content-subtle">Cantidad</span>
                                                                <input value={l.qty} onChange={e => cambiar(l.n, { qty: limpiarNum(e.target.value) })} inputMode="decimal" autoComplete="off"
                                                                    className="input h-10 text-right text-[13px] font-semibold tabular-nums" />
                                                            </label>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[12px] text-content-subtle">Presentación</span>
                                                                <CustomSelect value={l.unidad}
                                                                    onChange={v => cambiar(l.n, { unidad: v, ...(v === "UNIDAD" ? { tamano: "1" } : {}) })}
                                                                    options={PKG_UNITS.filter(u => u !== "PIEZA").map(u => ({ value: u, label: toNameCase(u) }))}
                                                                    className="w-full" height="h-10" />
                                                            </div>
                                                            <label className="flex flex-col gap-1">
                                                                <span className="text-[12px] text-content-subtle truncate">
                                                                    {l.unidad === "UNIDAD" ? "Se compra suelto" : `${l.producto ? toNameCase(unidadCorta(l.producto.unit)) : "Unidades"} por ${l.unidad.toLowerCase()}`}
                                                                </span>
                                                                <input value={l.tamano} onChange={e => cambiar(l.n, { tamano: limpiarNum(e.target.value) })} inputMode="decimal" autoComplete="off"
                                                                    disabled={l.unidad === "UNIDAD"}
                                                                    className={`input h-10 text-right text-[13px] font-semibold tabular-nums disabled:opacity-40 ${!(num(l.tamano) > 0) ? "!border-amber-500" : ""}`} />
                                                            </label>
                                                            <label className="flex flex-col gap-1">
                                                                <span className="text-[12px] text-content-subtle truncate">Costo por {l.unidad === "UNIDAD" ? "unidad" : l.unidad.toLowerCase()}</span>
                                                                <span className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{sym}</span>
                                                                    <input value={l.costo} onChange={e => cambiar(l.n, { costo: limpiarNum(e.target.value) })} inputMode="decimal" autoComplete="off"
                                                                        className="input h-10 pl-11 text-right text-[13px] font-semibold tabular-nums" />
                                                                </span>
                                                            </label>
                                                            <label className="flex flex-col gap-1">
                                                                <span className="text-[12px] text-content-subtle truncate">Margen</span>
                                                                <span className="relative">
                                                                    <input value={vendible ? margen : ""} onChange={e => cambiar(l.n, { margen: limpiarNum(e.target.value) })}
                                                                        inputMode="decimal" autoComplete="off" disabled={!l.producto || !vendible}
                                                                        placeholder={!l.producto ? "" : !vendible ? "No se vende" : "Sin cambio"}
                                                                        className="input h-10 pr-8 text-right text-[13px] font-semibold tabular-nums disabled:opacity-40 placeholder:font-normal" />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                                                </span>
                                                            </label>
                                                        </div>

                                                        <div className="mt-1.5 text-[12px] text-content-subtle tabular-nums">
                                                            {unidades > 0 && l.producto
                                                                ? <>
                                                                    Entran {Number(unidades.toFixed(3))} {unidadCorta(l.producto.unit, unidades)}
                                                                    {costoRef > 0 ? ` · Ref. ${fmt2(costoRef)} c/u` : ""}
                                                                    {precioVenta != null
                                                                        ? <> · <span className="text-content dark:text-white font-medium">se vende a Ref. {fmt2(precioVenta)}</span></>
                                                                        : vendible && costoRef > 0 ? " · mantiene su precio de venta" : ""}
                                                                </>
                                                                : !l.producto ? "Elige el producto para ver cuánto entra al inventario." : null}
                                                        </div>
                                                        {l.revisar && (
                                                            <div className="mt-1 text-[12px] text-danger">
                                                                Revisa esta línea: en el papel el total es {sym} {fmt2(l.total_papel)}.
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[12px] text-content-subtle">
                            Los costos van sin IVA, como en el documento. Lo que emparejes aquí, Asta lo recuerda para la próxima factura.
                        </p>
                    </div>
                )}
            </Modal>

            {creando && (
                <ProductModal
                    open
                    onClose={() => setCreando(null)}
                    onSave={productoCreado}
                    categories={categorias}
                    loading={guardandoNuevo}
                    warehouseId={state.selectedWarehouseId || null}
                    initialName={creando.nombre}
                    onPickExisting={p => { asignar(creando.n, p); setCreando(null); }}
                />
            )}
        </>
    );
}
