import { useState, useEffect, useRef } from "react";
import CustomSelect from "../ui/CustomSelect";
import Segmented from "../ui/Segmented";
import Money from "../ui/Money";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { useApp } from "../../context/AppContext";
import { cartKey } from "../../helpers/cartLine";

// Mismo redondeo por línea que CartContext y CartSidebar: las líneas tienen que sumar el
// total que se factura, al céntimo.
const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

const ICON_TAG = "M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z";
const ICON_TRASH = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

const enCampo = (el) => {
    const tag = el?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable;
};

// Revisión del pedido antes de facturar (Configuración → Punto de venta). Reemplaza al
// modal de Factura/Cotización con las mismas teclas —1/2 eligen, Enter confirma, F10 otra
// vez factura—, así que quien venía de memoria no nota el cambio. Todo lo que se edita aquí
// es el mismo carrito de la caja: no hay copia que sincronizar.
export default function CheckoutReview({
    open, onClose, onSelectFactura, onSelectCotizacion, blocked = false,
    cart, removeFromCart, changeQty, setQtyDirect,
    convertToDisplay, convertToSecondary, currSym, secondaryCurrency, fmt,
    promoLineDiscountDisplay, activePromos = [],
    subtotalDisplay, promoDiscount = 0, promoDiscountDisplay,
    discountEnabled, setDiscountEnabled, discountPct, setDiscountPct, discountMode, setDiscountMode,
    discountAmount, discountAmountDisplay,
    chargeEnabled, setChargeEnabled, chargeLabel, setChargeLabel, chargeMode, setChargeMode,
    chargeInput, setChargeInput, setChargeFromPct, chargeAmountDisplay = 0, chargePct = 0,
    fxEnabled, setFxEnabled, fxRateInput = "", setFxRateInput, fxActivo = false, fxDiscount = 0,
    avanceOn = false, setAvanceOn, avanceMonto = "", setAvanceMonto, avancePct = "", setAvancePct,
    totalDisplay, totalSecondary,
    currentCurrency, setSelectedCurrency, activeCurrencies = [],
    selectedSerieId, selectSerie, mySeries = [],
    selectedCustomer, setSelectedCustomer,
    custSearch, setCustSearch, customers = [], pickCustomer,
    selectedCustIdx, setSelectedCustIdx, setCustomerEditData, setCustomerModal,
    cashSession, loading,
    setLineDiscount, convertToBase, lineManualDiscountDisplay = 0,
}) {
    const { can, settings } = useApp();
    // Descuentos: con permiso propio y, salvo el administrador, con el tope de Configuración →
    // Punto de venta. El servidor vuelve a comprobar las dos cosas (sales/lineDiscount.js).
    const canDiscount = can("sales.discount");
    const topeCfg = parseFloat(settings?.discount_max_pct);
    const tope = !can("admin") && topeCfg > 0 ? topeCfg : null;
    // Cobro a tasa de divisas: permiso propio, y solo si la caja maneja bolívares. La tasa tiene
    // que pasar la del sistema; por debajo sería un recargo (el servidor también lo exige).
    const monedaBs = activeCurrencies.find(c => !c.is_base) || null;
    const tasaSistema = parseFloat(monedaBs?.exchange_rate) || 0;
    // Además del permiso, la empresa tiene que tenerlo activo (Configuración → Punto de venta).
    const puedeFx = settings?.pos_fx_cobro === "true" && can("sales.fx") && tasaSistema > 1;
    const fxTecleada = parseFloat(String(fxRateInput).replace(",", ".")) || 0;
    const fxRef = useRef(null);
    // Avance de efectivo junto a la venta: opción de la empresa y permiso propio. No entra en la
    // factura: se cobra aparte en el mismo pase del punto (ver CartContext / PaymentFormModal).
    // No se combina con la tasa de divisas: se ofrece uno u otro.
    const puedeAvance = settings?.pos_cash_advance === "true" && can("sales.advance") && !!setAvanceOn && !fxEnabled;
    const avanceEfectivo = parseFloat(String(avanceMonto).replace(",", ".")) || 0;
    const avanceComision = Math.round(avanceEfectivo * (parseFloat(String(avancePct).replace(",", ".")) || 0)) / 100;
    const simboloBs = monedaBs?.symbol || "Bs.";

    const [accion, setAccion] = useState("factura");
    // Lo que falta para emitir, marcado al intentarlo. Antes la pantalla se cerraba y el aviso
    // "El cliente es requerido" aparecía sobre la caja, sin decir dónde corregirlo.
    const [faltan, setFaltan] = useState({});
    // Línea con el editor de descuento abierto, lo tecleado y el error si se pasa.
    const [ldEdit, setLdEdit]   = useState(null);
    const [ldDraft, setLdDraft] = useState({ mode: "pct", text: "" });
    const [ldError, setLdError] = useState("");
    const panelRef = useRef(null);
    const custRef  = useRef(null);
    const serieRef = useRef(null);

    // Al abrir, el foco sale del buscador de productos de atrás: si se quedaba ahí, el Enter
    // de "F10, Enter" caía en ese campo y no facturaba.
    useEffect(() => {
        if (!open) return;
        setAccion("factura");
        setFaltan({});
        setLdEdit(null);
        document.activeElement?.blur?.();
        requestAnimationFrame(() => panelRef.current?.focus());
    }, [open]);

    // Sin líneas no hay nada que revisar: se vuelve a la caja.
    useEffect(() => { if (open && cart.length === 0) onClose(); }, [open, cart.length, onClose]);

    // Al elegir lo que faltaba, la marca se va sola.
    useEffect(() => { if (selectedCustomer) setFaltan(f => (f.cliente ? { ...f, cliente: false } : f)); }, [selectedCustomer]);
    useEffect(() => { if (selectedSerieId) setFaltan(f => (f.serie ? { ...f, serie: false } : f)); }, [selectedSerieId]);
    useEffect(() => { if (!fxEnabled || fxActivo) setFaltan(f => (f.fx ? { ...f, fx: false } : f)); }, [fxEnabled, fxActivo]);

    // El cobro en divisas encendido sin una tasa válida no se factura: saldría a precio normal
    // sin que la caja lo note. La cotización no lo lleva, así que ahí no se exige.
    const fxError = !fxEnabled ? ""
        : fxTecleada > 0 && fxTecleada <= tasaSistema ? `Tiene que ser mayor que la del sistema (${tasaSistema.toFixed(2)})`
        : faltan.fx && !(fxTecleada > 0) ? "Escribe la tasa o apaga el cobro en divisas"
        : "";

    // Cliente siempre (también la cotización lo pide); serie solo para facturar. Lo que falte
    // se marca en rojo y se lleva la vista ahí: en el teléfono el cliente queda bajo las líneas.
    const listo = (que) => {
        const f = {
            cliente: !selectedCustomer,
            serie: que === "factura" && !selectedSerieId,
            fx: que === "factura" && !!fxEnabled && puedeFx && !fxActivo,
        };
        setFaltan(f);
        if (f.cliente) {
            custRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
            requestAnimationFrame(() => custRef.current?.focus());
        } else if (f.serie) {
            serieRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        } else if (f.fx) {
            fxRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
            requestAnimationFrame(() => fxRef.current?.focus());
        }
        return !f.cliente && !f.serie && !f.fx;
    };
    const facturar = () => { if (!loading && cart.length && listo("factura")) onSelectFactura(); };
    const cotizar  = () => { if (!loading && cart.length && listo("cotizacion")) onSelectCotizacion(); };
    const confirmar = () => (accion === "cotizacion" ? cotizar() : facturar());

    useEffect(() => {
        if (!open || blocked) return;
        const handler = (e) => {
            // Las F son de esta pantalla mientras está abierta: F1 o F4 tocarían la caja de
            // atrás sin que se vea (enfocar su buscador, pausar el carrito).
            if (/^F\d{1,2}$/.test(e.key)) {
                e.preventDefault(); e.stopPropagation();
                if (e.key === "F10") facturar();
                if (e.key === "F2") custRef.current?.focus();
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                if (enCampo(e.target)) { e.target.blur(); panelRef.current?.focus(); return; }
                onClose();
                return;
            }
            // En un campo, las teclas son del campo; en un botón, Enter ya lo pulsa el navegador.
            if (enCampo(e.target)) return;
            if (e.key === "1") { e.preventDefault(); e.stopPropagation(); setAccion("factura"); }
            if (e.key === "2") { e.preventDefault(); e.stopPropagation(); setAccion("cotizacion"); }
            if (e.key === "Enter" && e.target?.tagName !== "BUTTON") { e.preventDefault(); e.stopPropagation(); confirmar(); }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const sym = currentCurrency?.symbol || currSym;
    const unidades = cart.filter(i => !i.parentKey).length;   // los adicionales cuelgan del plato

    const linea = (i) => {
        const descuento = promoLineDiscountDisplay ? promoLineDiscountDisplay(i) : 0;
        const bruto = round2(convertToDisplay(i.price)) * (parseFloat(i.qty) || 0);
        const ratio = bruto > 0 ? descuento / bruto : 0;
        return {
            descuento,
            total: bruto - descuento,
            secundario: secondaryCurrency ? round2(convertToSecondary(i.price)) * (parseFloat(i.qty) || 0) * (1 - ratio) : null,
        };
    };

    const promoDe = (i) => activePromos.find(p => p.product_ids?.includes(i.id));

    const brutoDisplay = (i) => round2(convertToDisplay(i.price)) * (parseFloat(i.qty) || 0);
    const abrirDescuento = (i) => {
        if (ldEdit === cartKey(i)) { setLdEdit(null); return; }
        setLdEdit(cartKey(i));
        setLdError("");
        setLdDraft(i.ld_mode
            ? { mode: i.ld_mode, text: i.ld_mode === "pct" ? String(i.ld_value) : String(round2(convertToDisplay(i.ld_value))) }
            : { mode: "pct", text: "" });
    };
    // Se aplica mientras se teclea, como el descuento de la venta. Lo que se pasa del tope o de
    // la línea no se aplica: queda escrito con el aviso, y la línea sigue con lo último válido.
    const aplicarDescuento = (i, mode, text) => {
        setLdDraft({ mode, text });
        const n = parseFloat(String(text).replace(",", "."));
        if (!(n > 0)) { setLdError(""); setLineDiscount(cartKey(i), null); return; }
        const bruto = brutoDisplay(i);
        const pct = mode === "pct" ? n : (bruto > 0 ? (n / bruto) * 100 : 0);
        if (mode === "pct" && n > 100) return setLdError("No puede pasar del 100 %");
        if (mode === "amount" && n > bruto + 0.005) return setLdError("No puede ser mayor que la línea");
        if (tope && pct > tope + 0.005) return setLdError(`Tu tope es ${tope} % por línea`);
        setLdError("");
        // El monto se guarda en la moneda base; el porcentaje, tal cual.
        setLineDiscount(cartKey(i), mode, mode === "pct" ? n : convertToBase(n));
    };
    const etiquetaDescuento = (i) => i.ld_mode === "pct"
        ? `-${parseFloat(i.ld_value).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`
        : "Desc.";

    const botonDescuento = (i, className = "") => canDiscount && (
        <button type="button" onClick={() => abrirDescuento(i)} aria-label={`Descuento de ${i.name}`} title="Descuento de esta línea"
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${i.ld_mode || ldEdit === cartKey(i)
                ? "bg-brand-500/10 text-brand-700 dark:text-brand-300"
                : "text-content-subtle hover:text-content hover:bg-surface-2 dark:hover:text-white dark:hover:bg-white/[0.06]"} ${className}`}>
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICON_TAG} /></svg>
        </button>
    );

    const editorDescuento = (i) => {
        const promo = promoDe(i);
        const chips = [5, 10, 15, 20].filter(p => !tope || p <= tope);
        return (
            <div className="px-4 sm:px-5 pb-3 lg:pl-[92px]">
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-surface-1 dark:bg-white/[0.03] p-3 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented value={ldDraft.mode} onChange={m => aplicarDescuento(i, m, "")} options={modoOpts} />
                        <input
                            autoFocus
                            type="text" inputMode="decimal" autoComplete="off"
                            value={ldDraft.text}
                            onChange={e => aplicarDescuento(i, ldDraft.mode, e.target.value.replace(",", "."))}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setLdEdit(null); panelRef.current?.focus(); } }}
                            placeholder={ldDraft.mode === "pct" ? "0" : "0.00"}
                            aria-label="Descuento"
                            className={`${INPUT} w-28 text-right tabular-nums ${ldError ? "!border-red-500 focus:!ring-red-500/20" : ""}`}
                        />
                        {chips.map(pc => (
                            <button key={pc} type="button" onClick={() => aplicarDescuento(i, "pct", String(pc))}
                                className={`h-10 px-2.5 rounded-lg text-[12px] font-semibold tabular-nums ${i.ld_mode === "pct" && parseFloat(i.ld_value) === pc ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40" : "btn-outline"}`}>
                                {pc} %
                            </button>
                        ))}
                        <div className="ml-auto flex items-center gap-1">
                            {i.ld_mode && (
                                <button type="button" onClick={() => { setLineDiscount(cartKey(i), null); setLdDraft({ mode: ldDraft.mode, text: "" }); setLdError(""); }}
                                    className="h-10 px-3 rounded-lg text-[13px] font-semibold text-content-subtle hover:text-content dark:hover:text-white">
                                    Quitar
                                </button>
                            )}
                            <button type="button" onClick={() => setLdEdit(null)} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-semibold">Listo</button>
                        </div>
                    </div>
                    {(ldError || tope || promo) && (
                        <p className={`text-[12px] leading-snug ${ldError ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                            {ldError || [
                                tope ? `Hasta ${tope} % por línea.` : null,
                                promo ? "Reemplaza a la promoción de este producto." : null,
                            ].filter(Boolean).join(" ")}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    // Funciones que devuelven JSX, no componentes: un componente declarado dentro del render
    // se vuelve a montar en cada tecla y el campo de cantidad perdía el foco.
    const stepper = (i) => (
        <div className="flex items-center h-10 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] shrink-0">
            <button type="button" onClick={() => changeQty(cartKey(i), -1)} aria-label="Restar uno" className="w-10 h-full flex items-center justify-center text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white rounded-l-lg active:bg-surface-2 dark:active:bg-white/[0.06]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.2} d="M5 12h14" /></svg>
            </button>
            <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={i.qty}
                onChange={e => setQtyDirect(cartKey(i), e.target.value.replace(",", "."))}
                onBlur={() => {
                    // Igual que en el carrito: vacío o cero se tolera al teclear "0,5", pero la
                    // línea no se queda en cero al salir del campo.
                    const q = parseFloat(i.qty);
                    if (!(q > 0)) setQtyDirect(cartKey(i), String(parseFloat(i.qty_step) || 1), true);
                }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); panelRef.current?.focus(); } }}
                aria-label={`Cantidad de ${i.name}`}
                className="w-12 h-full bg-transparent text-center text-[14px] font-semibold tabular-nums text-content dark:text-white border-x border-border dark:border-white/10 outline-none focus:bg-brand-500/[0.06]"
            />
            <button type="button" onClick={() => changeQty(cartKey(i), 1)} aria-label="Sumar uno" className="w-10 h-full flex items-center justify-center text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white rounded-r-lg active:bg-surface-2 dark:active:bg-white/[0.06]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>
            </button>
        </div>
    );

    const quitar = (i, className = "") => (
        <button type="button" onClick={() => removeFromCart(cartKey(i))} aria-label={`Quitar ${i.name}`} title="Quitar del pedido"
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-content-subtle hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 shrink-0 ${className}`}>
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICON_TRASH} /></svg>
        </button>
    );

    const ajuste = (titulo, on, toggle, children) => (
        <div className="rounded-xl border border-border/70 dark:border-white/[0.08]">
            <label className="flex items-center justify-between gap-3 px-3.5 h-11 cursor-pointer">
                <span className="text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                <span className="relative inline-flex items-center shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={!!on} onChange={toggle} />
                    <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
                </span>
            </label>
            {on && <div className="px-3.5 pb-3.5 space-y-2.5">{children}</div>}
        </div>
    );

    const INPUT = "h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
    const modoOpts = [{ key: "pct", label: "%" }, { key: "amount", label: sym }];

    const totalTxt = fmt(totalDisplay, currSym);
    // La factura en bolívares, para sumarle el avance (que siempre se cuenta en Bs).
    const totalBsFactura = !currentCurrency?.is_base
        ? (parseFloat(totalDisplay) || 0)
        : (secondaryCurrency && !secondaryCurrency.is_base ? (parseFloat(totalSecondary) || 0) : (parseFloat(totalDisplay) || 0) * tasaSistema);
    const BOTON = "h-12 sm:h-11 px-5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap";

    return (
        <div className="fixed inset-0 z-[200] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-stretch lg:items-center justify-center lg:p-6 overlay-in" onClick={e => e.target === e.currentTarget && onClose()}>
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-label="Revisar pedido"
                className="w-full lg:max-w-6xl h-full lg:h-[88vh] bg-white dark:bg-surface-dark-2 lg:border border-black/[0.06] dark:border-white/[0.08] lg:rounded-2xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden outline-none modal-in"
            >
                {/* Cabecera */}
                <div className="flex items-center gap-3 pl-3 pr-4 sm:pl-4 py-3 border-b border-border/60 dark:border-white/[0.06] shrink-0">
                    <button type="button" onClick={onClose} aria-label="Volver a la caja" title="Volver a la caja (Esc)"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-2 dark:hover:text-white dark:hover:bg-white/[0.06]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] font-semibold tracking-tight text-content dark:text-white">Revisar pedido</h2>
                        <p className="text-[12px] text-content-subtle">
                            {unidades} {unidades === 1 ? "producto" : "productos"}
                            <span className="hidden sm:inline"> · Enter factura · 2 cotiza · Esc vuelve</span>
                        </p>
                    </div>
                </div>

                {/* Cuerpo: en el teléfono un solo scroll (líneas y luego el panel); en escritorio
                    dos columnas, cada una con el suyo. */}
                <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">

                    {/* Líneas */}
                    <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-border/60 dark:divide-white/[0.06]">
                        {cart.map(i => {
                            const l = linea(i);
                            const promo = promoDe(i);
                            // Extra con precio de un plato: colgado de él, sin cantidad propia. El
                            // contorno incluido (a 0, solo descuenta inventario) ya va en el plato.
                            if (i.parentKey && i.incluido) return null;
                            if (i.parentKey) return (
                                <div key={cartKey(i)} className="flex items-center gap-2 pl-[76px] lg:pl-[88px] pr-4 sm:pr-5 py-2">
                                    <span className="flex-1 min-w-0 text-[13px] text-content dark:text-white/85">
                                        + {i.name}{parseFloat(i.qty) !== 1 ? <span className="text-content-subtle"> × {fmtQtyUnit(i.qty, i.unit).toLowerCase()}</span> : null}
                                    </span>
                                    <Money value={fmt(l.total, currSym)} className="text-[13px] font-semibold text-content dark:text-white whitespace-nowrap" />
                                    {quitar(i)}
                                </div>
                            );
                            return (
                              <div key={cartKey(i)}>
                                <div className="flex items-start lg:items-center gap-3 px-4 sm:px-5 py-3">
                                    <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl bg-surface-2 dark:bg-white/[0.05] overflow-hidden shrink-0 flex items-center justify-center">
                                        {i.image_url
                                            ? <img src={resolveImageUrl(i.image_url)} alt="" loading="lazy" onError={imgRetryOnError} className="w-full h-full object-cover" />
                                            : <svg className="w-6 h-6 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <div className="text-[14px] font-semibold text-content dark:text-white leading-snug break-words min-w-0">{i.name}</div>
                                            <Money value={fmt(l.total, currSym)} className="lg:hidden text-[14px] font-semibold text-content dark:text-white whitespace-nowrap" />
                                        </div>
                                        {(i.addon_text || (i.addon_options ? i.kitchen_note : i.note)) && (
                                            <div className="text-[13px] text-content dark:text-white/80 leading-snug">
                                                {i.addon_text}
                                                {(i.addon_options ? i.kitchen_note : i.note) && (
                                                    <span className="text-amber-700 dark:text-amber-400">{i.addon_text ? " · " : ""}{i.addon_options ? i.kitchen_note : i.note}</span>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-0.5 text-[13px] text-content-subtle tabular-nums flex flex-wrap items-center gap-x-1.5">
                                            <span>{fmtQtyUnit(i.qty, i.unit).toLowerCase()} × {fmt(convertToDisplay(i.price), currSym)}</span>
                                            {/* El descuento manual reemplaza a la promoción: se muestra uno u otro. */}
                                            {i.ld_mode ? (
                                                <span className="text-[11px] font-semibold px-1.5 py-px rounded bg-brand-500/10 text-brand-700 dark:text-brand-300">{etiquetaDescuento(i)}</span>
                                            ) : promo && (
                                                <span className="text-[11px] font-semibold px-1.5 py-px rounded bg-brand-500/10 text-brand-700 dark:text-brand-300">
                                                    {promo.type === "percentage" ? `-${promo.discount_pct}%` : `${promo.buy_qty}+${promo.get_qty}`}
                                                </span>
                                            )}
                                            {l.descuento > 0 && <span>· −{fmt(l.descuento, currSym)}</span>}
                                        </div>
                                        {/* Teléfono: cantidad y quitar debajo, a lo ancho. */}
                                        <div className="lg:hidden mt-2 flex items-center justify-between gap-2">
                                            {stepper(i)}
                                            <div className="flex items-center gap-1">
                                                {l.secundario != null && <Money value={fmt(l.secundario, secondaryCurrency.symbol)} className="text-[12px] text-content-subtle whitespace-nowrap mr-1" />}
                                                {botonDescuento(i)}
                                                {quitar(i)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Escritorio: columnas fijas para que cantidades y montos se lean en vertical. */}
                                    <div className="hidden lg:block">{stepper(i)}</div>
                                    <div className="hidden lg:block w-36 text-right shrink-0">
                                        <Money value={fmt(l.total, currSym)} className="text-[15px] font-semibold text-content dark:text-white" />
                                        {l.secundario != null && <div><Money value={fmt(l.secundario, secondaryCurrency.symbol)} className="text-[12px] text-content-subtle" /></div>}
                                    </div>
                                    {botonDescuento(i, "hidden lg:flex")}
                                    {quitar(i, "hidden lg:flex")}
                                </div>
                                {ldEdit === cartKey(i) && editorDescuento(i)}
                              </div>
                            );
                        })}
                    </div>

                    {/* Panel lateral: datos de la factura, ajustes y total */}
                    <div className="lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-border/60 dark:border-white/[0.06] bg-surface-1/60 dark:bg-white/[0.015] lg:min-h-0 lg:overflow-y-auto p-4 sm:p-5 space-y-5">

                        {/* Cliente */}
                        <div>
                            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                                <span className="text-[12px] font-medium text-content-subtle">Cliente</span>
                                {!selectedCustomer && (
                                    <span className={`text-[12px] font-semibold ${faltan.cliente ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                                        {faltan.cliente ? "Elige el cliente para continuar" : "Falta"}
                                    </span>
                                )}
                            </p>
                            {selectedCustomer ? (
                                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-border/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
                                    <div className="min-w-0">
                                        <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(selectedCustomer.name) || "Sin nombre"}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums truncate">{selectedCustomer.rif || "Sin documento"}</div>
                                    </div>
                                    <button type="button" onClick={() => { setSelectedCustomer(null); requestAnimationFrame(() => custRef.current?.focus()); }}
                                        className="text-[13px] font-semibold text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white px-2 h-9 rounded-lg shrink-0">
                                        Cambiar
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input
                                        ref={custRef}
                                        value={custSearch}
                                        onChange={e => { setCustSearch(e.target.value); setSelectedCustIdx(-1); }}
                                        onKeyDown={e => {
                                            if (!custSearch.trim()) return;
                                            const total = customers.length + 1;
                                            if (e.key === "ArrowDown") { e.preventDefault(); setSelectedCustIdx(x => Math.min(x + 1, total - 1)); }
                                            else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedCustIdx(x => Math.max(x - 1, -1)); }
                                            else if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (selectedCustIdx >= 0 && selectedCustIdx < customers.length) pickCustomer(customers[selectedCustIdx]);
                                                else if (customers.length === 1) pickCustomer(customers[0]);
                                                else if (selectedCustIdx === customers.length || customers.length === 0) {
                                                    setCustomerEditData({ name: custSearch.trim(), _fromCobro: true }); setCustomerModal(true); setCustSearch(""); setSelectedCustIdx(-1);
                                                }
                                            }
                                        }}
                                        placeholder="Buscar por nombre o cédula (F2)"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className={`${INPUT} w-full pl-9 ${faltan.cliente ? "!border-red-500 ring-2 ring-red-500/20" : !selectedCustomer ? "!border-amber-500/70" : ""}`}
                                    />
                                    {custSearch.trim().length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 p-1 bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-10 popover-in max-h-64 overflow-y-auto">
                                            {customers.map((c, idx) => (
                                                <button key={c.id} type="button" onClick={() => pickCustomer(c)} onMouseEnter={() => setSelectedCustIdx(idx)}
                                                    className={`w-full text-left px-3 py-2 rounded-lg flex flex-col ${idx === selectedCustIdx ? "bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}>
                                                    <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(c.name)}</span>
                                                    <span className="text-[12px] text-content-subtle tabular-nums">{c.rif || "Sin documento"}</span>
                                                </button>
                                            ))}
                                            <button type="button"
                                                onClick={() => { setCustomerEditData({ name: custSearch.trim(), _fromCobro: true }); setCustomerModal(true); setCustSearch(""); setSelectedCustIdx(-1); }}
                                                className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-semibold text-brand-700 dark:text-brand-300 flex items-center gap-2 ${selectedCustIdx === customers.length ? "bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}>
                                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" /></svg>
                                                <span className="truncate">Crear cliente «{custSearch.trim()}»</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Moneda y serie */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="min-w-0">
                                <p className="mb-1.5 text-[12px] font-medium text-content-subtle">Moneda</p>
                                <CustomSelect
                                    value={currentCurrency?.id || ""}
                                    onChange={val => setSelectedCurrency(activeCurrencies.find(x => x.id === parseInt(val)))}
                                    options={activeCurrencies.map(c => ({ value: c.id, label: c.code }))}
                                />
                            </div>
                            <div ref={serieRef} className={`min-w-0 rounded-lg ${faltan.serie ? "ring-2 ring-red-500/40 ring-offset-2 ring-offset-transparent" : ""}`}>
                                <p className={`mb-1.5 text-[12px] font-medium ${faltan.serie ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>{faltan.serie ? "Elige la serie" : "Serie"}</p>
                                <CustomSelect
                                    value={selectedSerieId || ""}
                                    onChange={val => selectSerie(parseInt(val))}
                                    options={mySeries.map(s => ({ value: s.id, label: s.name }))}
                                    placeholder="Elegir serie"
                                />
                            </div>
                        </div>

                        {/* Descuento y recargo */}
                        <div className="space-y-2">
                            {canDiscount && ajuste("Descuento de la venta", discountEnabled, () => setDiscountEnabled(!discountEnabled), (
                                <div className="flex items-center gap-2">
                                    <Segmented value={discountMode} onChange={m => { setDiscountMode(m); setDiscountPct(""); }} options={modoOpts} />
                                    <input type="text" inputMode="decimal" autoComplete="off"
                                        value={discountPct} onChange={e => setDiscountPct(e.target.value.replace(",", "."))}
                                        placeholder={discountMode === "pct" ? "0" : "0.00"}
                                        className={`${INPUT} flex-1 min-w-0 text-right tabular-nums`} />
                                </div>
                            ))}
                            {ajuste("Recargo", chargeEnabled, () => setChargeEnabled(!chargeEnabled), (<>
                                <div className="flex items-center gap-2">
                                    <Segmented value={chargeMode} onChange={m => { setChargeMode(m); setChargeInput(""); }} options={modoOpts} />
                                    <input type="text" inputMode="decimal" autoComplete="off"
                                        value={chargeInput} onChange={e => setChargeInput(e.target.value.replace(",", "."))}
                                        placeholder={chargeMode === "pct" ? "0" : "0.00"}
                                        className={`${INPUT} flex-1 min-w-0 text-right tabular-nums`} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="text" maxLength={40} autoComplete="off" value={chargeLabel} onChange={e => setChargeLabel(e.target.value)}
                                        placeholder="Servicio" className={`${INPUT} flex-1 min-w-0`} />
                                    {[10, 15, 20].map(p => (
                                        <button key={p} type="button" onClick={() => setChargeFromPct(p)}
                                            className="btn-outline h-10 px-2.5 rounded-lg text-[12px] font-semibold tabular-nums shrink-0">{p}%</button>
                                    ))}
                                </div>
                            </>))}
                            {/* El dólar por encima de la tasa oficial: en bolívares la cuenta no
                                cambia, en divisas baja. Ver descuentoDivisas (helpers/currency). */}
                            {puedeFx && !avanceOn && ajuste("Cobro en divisas", fxEnabled, () => setFxEnabled(!fxEnabled), (<>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{monedaBs.symbol}</span>
                                    <input ref={fxRef} type="text" inputMode="decimal" autoComplete="off" autoFocus
                                        value={fxRateInput} onChange={e => setFxRateInput(e.target.value.replace(",", "."))}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); panelRef.current?.focus(); } }}
                                        placeholder={tasaSistema.toFixed(2)}
                                        aria-label="Tasa de divisas"
                                        className={`${INPUT} w-full pl-11 text-right tabular-nums ${fxError ? "!border-red-500 focus:!ring-red-500/20" : ""}`} />
                                </div>
                                <p className={`text-[12px] leading-snug ${fxError ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                                    {fxError || `Tasa a la que recibes la divisa. La del sistema es ${monedaBs.symbol} ${tasaSistema.toFixed(2)}.`}
                                </p>
                            </>))}
                            {/* El cliente compra y además pide efectivo: se cobra todo en un pase del
                                punto. No toca la factura; lo registra el cobro (services/cashAdvances). */}
                            {puedeAvance && ajuste("Avance de efectivo", avanceOn, () => {
                                if (!avanceOn && !String(avancePct).trim() && settings?.cash_advance_pct) setAvancePct(String(settings.cash_advance_pct));
                                setAvanceOn(!avanceOn);
                            }, (<>
                                <div className="grid grid-cols-[1fr_110px] gap-2">
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{simboloBs}</span>
                                        <input type="text" inputMode="decimal" autoComplete="off" autoFocus
                                            value={avanceMonto} onChange={e => setAvanceMonto(e.target.value.replace(",", "."))}
                                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); panelRef.current?.focus(); } }}
                                            placeholder="0.00" aria-label="Efectivo a entregar"
                                            className={`${INPUT} w-full pl-11 text-right tabular-nums`} />
                                    </div>
                                    <div className="relative">
                                        <input type="text" inputMode="decimal" autoComplete="off"
                                            value={avancePct} onChange={e => setAvancePct(e.target.value.replace(",", "."))}
                                            placeholder="0" aria-label="Comisión del avance en porcentaje"
                                            className={`${INPUT} w-full pr-8 text-right tabular-nums`} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                    </div>
                                </div>
                                <p className="text-[12px] text-content-subtle leading-snug">
                                    {avanceEfectivo > 0
                                        ? `Entregas ${simboloBs} ${avanceEfectivo.toFixed(2)} y cobras ${simboloBs} ${(avanceEfectivo + avanceComision).toFixed(2)} aparte de la factura, en el mismo pase del punto.`
                                        : "Efectivo que se lleva el cliente y comisión que se le cobra encima. No entra en la factura."}
                                </p>
                            </>))}
                        </div>

                        {/* Totales */}
                        <dl className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-4 py-3 space-y-1.5 text-[13px]">
                            <div className="flex justify-between gap-3 text-content-subtle">
                                <dt>Subtotal</dt><dd><Money value={fmt(subtotalDisplay, currSym)} /></dd>
                            </div>
                            {promoDiscount > 0 && (
                                <div className="flex justify-between gap-3 text-content-subtle">
                                    <dt>Promociones</dt><dd>−<Money value={fmt(promoDiscountDisplay, currSym)} /></dd>
                                </div>
                            )}
                            {lineManualDiscountDisplay > 0 && (
                                <div className="flex justify-between gap-3 text-content-subtle">
                                    <dt>Descuentos por línea</dt><dd>−<Money value={fmt(lineManualDiscountDisplay, currSym)} /></dd>
                                </div>
                            )}
                            {discountEnabled && discountAmount > 0 && (
                                <div className="flex justify-between gap-3 text-content-subtle">
                                    <dt>Descuento{discountMode === "pct" ? ` (${discountPct}%)` : ""}</dt>
                                    <dd>−<Money value={fmt(discountAmountDisplay, currSym)} /></dd>
                                </div>
                            )}
                            {chargeAmountDisplay > 0 && (
                                <div className="flex justify-between gap-3 text-content-subtle">
                                    <dt className="truncate">{chargeLabel?.trim() || "Servicio"}{chargePct >= 0.05 ? ` (${chargePct.toFixed(1)}%)` : ""}</dt>
                                    <dd className="shrink-0">+<Money value={fmt(chargeAmountDisplay, currSym)} /></dd>
                                </div>
                            )}
                            {/* En divisas la diferencia de tasa es un descuento; en bolívares no
                                hay nada que rebajar, la cuenta es la misma. */}
                            {fxActivo && fxDiscount > 0 && currentCurrency?.is_base && (
                                <div className="flex justify-between gap-3 text-content-subtle">
                                    <dt>Pago en divisas (tasa {fxTecleada.toFixed(2)})</dt>
                                    <dd className="shrink-0">−<Money value={fmt(fxDiscount, currSym)} /></dd>
                                </div>
                            )}
                            <div className="flex justify-between items-end gap-3 pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06]">
                                <dt className="text-[14px] font-semibold text-content dark:text-white">Total</dt>
                                <dd className="text-right">
                                    <Money value={totalTxt} className="text-[24px] font-bold tracking-tight text-content dark:text-white" />
                                    {secondaryCurrency && (fxActivo && !currentCurrency?.is_base ? (
                                        // Con la pantalla en Bs, lo que cambia es la cifra en divisas.
                                        <div className="mt-0.5 text-[13px] text-content-subtle">
                                            En divisas a {fxTecleada.toFixed(2)}{" "}
                                            <Money value={fmt(totalSecondary, secondaryCurrency.symbol)} className="text-[15px] font-semibold text-content dark:text-white" />
                                        </div>
                                    ) : (
                                        <div><Money value={fmt(totalSecondary, secondaryCurrency.symbol)} className="text-[13px] text-content-subtle" /></div>
                                    ))}
                                </dd>
                            </div>
                            {/* El avance no entra en la factura, pero sí en lo que se pasa por el punto:
                                se dice aquí para que el cajero sepa la cifra antes de facturar. */}
                            {puedeAvance && avanceOn && avanceEfectivo > 0 && (<>
                                <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06] text-content-subtle">
                                    <dt>Avance de efectivo + comisión</dt>
                                    <dd className="shrink-0">+<Money value={fmt(avanceEfectivo + avanceComision, simboloBs)} /></dd>
                                </div>
                                <div className="flex justify-between items-baseline gap-3">
                                    <dt className="font-semibold text-content dark:text-white">A pasar por el punto</dt>
                                    <dd className="shrink-0"><Money value={fmt(totalBsFactura + avanceEfectivo + avanceComision, simboloBs)} className="text-[15px] font-semibold text-content dark:text-white" /></dd>
                                </div>
                            </>)}
                        </dl>

                        {!cashSession && (
                            <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] leading-snug">
                                <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Caja cerrada: puedes cotizar, pero para facturar hay que abrir el turno.
                            </p>
                        )}
                    </div>
                </div>

                {/* Acciones. Hermanas del área que se desplaza: siempre a la vista, también en el
                    teléfono. La elegida con 1/2 es la que lleva el color. */}
                <div className="shrink-0 border-t border-border/60 dark:border-white/[0.06] px-4 sm:px-5 py-3 flex flex-col-reverse sm:flex-row sm:items-center gap-2">
                    <button type="button" onClick={onClose} className="hidden sm:inline-flex h-11 px-3 rounded-lg text-[13px] font-semibold text-content-subtle hover:text-content dark:hover:text-white items-center">
                        Seguir vendiendo
                    </button>
                    <div className="sm:ml-auto flex flex-col sm:flex-row gap-2">
                        <button type="button" onClick={() => { setAccion("cotizacion"); cotizar(); }} disabled={loading}
                            className={`${BOTON} ${accion === "cotizacion" ? "btn-accent" : "btn-outline"}`}>
                            <span className="hidden sm:inline text-[11px] opacity-60 tabular-nums">2</span>
                            Cotizar
                        </button>
                        <button type="button" onClick={() => { setAccion("factura"); facturar(); }} disabled={loading}
                            className={`${BOTON} sm:min-w-[220px] ${accion === "factura" ? "btn-accent" : "btn-outline"}`}>
                            <span className="hidden sm:inline text-[11px] opacity-60 tabular-nums">1</span>
                            {loading ? "Facturando…" : <>Facturar <Money value={totalTxt} className={accion === "factura" ? "[&>span]:!text-brand-ink/60" : ""} /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
