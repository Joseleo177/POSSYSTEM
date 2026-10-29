import { useState, useEffect, useRef } from "react";
import CustomSelect from "../ui/CustomSelect";
import Money from "../ui/Money";
import { Spinner } from "../ui/Spinner";
import PaymentFields, { OptionCard, pagoVacio, faltaEnPago } from "./PaymentFields";
import CatalogSheet, { SheetHeader, sheetSkin } from "./CatalogSheet";
import MapPicker, { direccionDePunto } from "./MapPicker";
import { toNameCase } from "../../helpers";

// Paso final del pedido: cómo lo recibe (retiro o delivery con su zona, dirección y punto GPS)
// y cómo paga (reporta el pago o paga al recibir). Va fuera del tema, como el selector de tallas:
// los tres temas abren este mismo paso desde su carrito.
//
// La dirección se recuerda en el navegador, por tienda: quien pide seguido no la reescribe.
// `panel` la pinta con la piel de la carta del tema de menú (ver CatalogSheet).

// Título de cada parte con su número: el cliente ve de un vistazo que son tres cosas y en
// cuál va, en vez de un formulario largo sin forma.
function Paso({ n, children, skin, extra = null }) {
    return (
        <div className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold tabular-nums ${skin.carta ? "bg-neutral-900 text-white" : "bg-surface-3 dark:bg-white/10 text-content dark:text-white"}`}>{n}</span>
            <p className={`flex-1 ${skin.section}`}>{children}</p>
            {extra}
        </div>
    );
}

function leerDireccion(token) {
    try { return JSON.parse(localStorage.getItem(`catalog_address_${token}`)) || null; }
    catch { return null; }
}

export default function CheckoutSheet({
    open, onClose, token, checkout, cartTotal, identity, branch,
    fmt, baseCur, altCur, sending, sendError, onSend, panel = null,
}) {
    const soloUna = checkout ? (checkout.pickup !== checkout.delivery) : true;
    const [modo, setModo] = useState(null);
    const [zona, setZona] = useState("");
    const [direccion, setDireccion] = useState("");
    const [referencia, setReferencia] = useState("");
    const [punto, setPunto] = useState(null);
    const [geo, setGeo] = useState({ loading: false, error: null });
    const [mapa, setMapa] = useState(false);
    const [pago, setPago] = useState(pagoVacio);
    const [alRecibir, setAlRecibir] = useState(false);
    const [nota, setNota] = useState("");
    const [falta, setFalta] = useState(null);
    // Dirección sacada del punto del mapa: 'buscando' mientras llega, 'auto' si se llenó sola
    // (se le pide al cliente que la complete), null si la escribió él.
    const [dirOrigen, setDirOrigen] = useState(null);
    const dirRef = useRef("");
    dirRef.current = direccion;

    // Con el punto marcado y la dirección vacía, se busca la del punto y se escribe sola. Nunca
    // se pisa lo que el cliente ya tecleó: si escribió mientras llegaba la respuesta, gana él.
    useEffect(() => {
        if (!open || !punto || direccion.trim()) return;
        let vivo = true;
        setDirOrigen("buscando");
        direccionDePunto(punto.lat, punto.lng).then((texto) => {
            if (!vivo) return;
            if (!texto || dirRef.current.trim()) { setDirOrigen(null); return; }
            setDireccion(texto);
            setDirOrigen("auto");
        });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, punto?.lat, punto?.lng]);

    // Al abrir: la única forma de entrega si solo hay una, y la última dirección usada.
    useEffect(() => {
        if (!open || !checkout) return;
        setModo(soloUna ? (checkout.delivery ? "delivery" : "retiro") : null);
        const d = leerDireccion(token);
        if (d) {
            if (checkout.zones.some(z => String(z.id) === String(d.zone))) setZona(String(d.zone));
            setDireccion(d.address || "");
            setReferencia(d.reference || "");
            setPunto(d.point || null);
        }
        setPago(pagoVacio());
        setAlRecibir(false);
        setMapa(false);
        setFalta(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open || !checkout) return null;
    const skin = sheetSkin(panel);

    const opciones = checkout.payment_options || [];
    const zonaSel = checkout.zones.find(z => String(z.id) === String(zona)) || null;
    const recargo = modo === "delivery" && zonaSel ? zonaSel.price : 0;
    const total = Math.round((cartTotal + recargo) * 100) / 100;
    const puedeDespues = checkout.pay_later;
    const etiquetaDespues = modo === "delivery" ? "Pagar al recibir" : "Pagar al retirar";

    const usarUbicacion = () => {
        if (!navigator.geolocation) return setGeo({ loading: false, error: "Tu navegador no comparte la ubicación." });
        setGeo({ loading: true, error: null });
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setPunto({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
                setGeo({ loading: false, error: null });
            },
            (err) => setGeo({
                loading: false,
                error: err.code === 1 ? "No diste permiso para ver tu ubicación. Escribe la dirección." : "No se pudo obtener tu ubicación. Intenta de nuevo.",
            }),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
    };

    const validar = () => {
        if (!modo) return "Elige cómo recibes tu pedido";
        if (modo === "delivery") {
            if (checkout.zones.length && !zonaSel) return "Elige la zona de entrega";
            if (direccion.trim().length < 5) return "Escribe la dirección de entrega";
        }
        if (opciones.length && !alRecibir) {
            if (!pago.option_id) return puedeDespues ? "Elige cómo pagas" : "Reporta tu pago para enviar el pedido";
            return faltaEnPago(pago);
        }
        return null;
    };

    const enviar = () => {
        const f = validar();
        setFalta(f);
        if (f) return;
        if (modo === "delivery") {
            try {
                localStorage.setItem(`catalog_address_${token}`, JSON.stringify({ zone: zona, address: direccion.trim(), reference: referencia.trim(), point: punto }));
            } catch { /* modo privado */ }
        }
        onSend({
            fulfillment: modo,
            delivery: modo === "delivery"
                ? { zone_id: zonaSel?.id || null, address: direccion.trim(), reference: referencia.trim() || null, lat: punto?.lat ?? null, lng: punto?.lng ?? null }
                : null,
            payment: opciones.length && !alRecibir && pago.option_id
                ? { ...pago, amount: String(pago.amount).replace(",", ".") }
                : null,
            note: nota.trim(),
        });
    };

    return (
        <CatalogSheet skin={skin} onClose={sending ? null : onClose} label="Finalizar pedido" z="z-[60]">
                <SheetHeader
                    skin={skin}
                    icon={skin.carta ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10V6a3 3 0 016 0v4" /></svg> : null}
                    title="Finalizar pedido"
                    subtitle={identity ? `A nombre de ${toNameCase(identity.name)} · ${identity.document}` : null}
                    onClose={onClose}
                    closeDisabled={sending}
                />

                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6">
                    {/* ── Entrega ── */}
                    <section className="space-y-3">
                        <Paso n={1} skin={skin}>Cómo lo recibes</Paso>
                        {soloUna ? (
                            <p className={`text-[14px] ${skin.muted}`}>
                                {checkout.delivery ? "Te lo llevamos a tu dirección." : `Lo retiras en ${branch?.name ? `la tienda ${branch.name}` : "la tienda"}.`}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <OptionCard selected={modo === "retiro"} onClick={() => setModo("retiro")} letter={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6" /></svg>
                                } title="Retiro en tienda" subtitle={branch?.name || "Sin costo"} skin={skin} />
                                <OptionCard selected={modo === "delivery"} onClick={() => setModo("delivery")} letter={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
                                } title="Delivery" subtitle={checkout.zones.length
                                    ? `Desde ${fmt(Math.min(...checkout.zones.map(z => z.price)), baseCur)}`
                                    : "A tu dirección"} skin={skin} />
                            </div>
                        )}

                        {modo === "delivery" && (
                            <div className="space-y-3 pt-1">
                                {checkout.zones.length > 0 && (
                                    <div>
                                        <span className={skin.label}>Zona</span>
                                        <CustomSelect value={zona} onChange={setZona} className="mt-1.5" height={skin.carta ? "h-12" : "h-11"}
                                            boxClassName={`text-[16px] sm:text-[14px] ${skin.carta ? "rounded-2xl bg-white border-black/10" : "rounded-xl"}`} placeholder="Elige tu zona"
                                            options={checkout.zones.map(z => ({ value: String(z.id), label: `${z.name} · ${z.price > 0 ? fmt(z.price, baseCur) : "Sin costo"}` }))} />
                                    </div>
                                )}
                                <label className="block">
                                    <span className={skin.label}>Dirección</span>
                                    <textarea value={direccion} onChange={e => { setDireccion(e.target.value.slice(0, 300)); setDirOrigen(null); }} rows={2}
                                        placeholder={dirOrigen === "buscando" ? "Buscando la dirección del punto..." : "Calle, edificio o casa, piso y apartamento"}
                                        className={`${skin.field} h-auto py-2.5 mt-1.5 resize-none`} />
                                    {dirOrigen === "auto" && (
                                        <span className={`block mt-1 text-[12px] ${skin.subtle}`}>Tomada del punto del mapa. Agrega el piso, apartamento o número de casa.</span>
                                    )}
                                </label>
                                <label className="block">
                                    <span className="flex items-center justify-between">
                                        <span className={skin.label}>Punto de referencia</span>
                                        <span className={`text-[12px] ${skin.subtle}`}>Opcional</span>
                                    </span>
                                    <input value={referencia} onChange={e => setReferencia(e.target.value.slice(0, 200))} autoComplete="off"
                                        placeholder="Ej. Frente a la panadería" className={`${skin.field} mt-1.5`} />
                                </label>

                                {/* El punto exacto, para que el repartidor lo abra en su mapa. No siempre es
                                    donde está el cliente (pide desde el trabajo, o para otra persona):
                                    por eso, además de su ubicación, puede marcarlo en el mapa. */}
                                {punto ? (
                                    <div className={`flex items-center gap-3 px-3.5 py-2.5 ${skin.card}`}>
                                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" strokeWidth={1.8} /></svg>
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-[14px] font-medium ${skin.ink}`}>Punto de entrega marcado</div>
                                            <a href={`https://www.google.com/maps?q=${punto.lat},${punto.lng}`} target="_blank" rel="noopener noreferrer"
                                                className="text-[12px] text-brand-600 dark:text-brand-400 underline-offset-2 hover:underline">Ver en Google Maps</a>
                                        </div>
                                        <button type="button" onClick={() => setMapa(true)} className={`text-[12px] font-semibold ${skin.ink} hover:underline underline-offset-2`}>Cambiar</button>
                                        <button type="button" onClick={() => setPunto(null)} className={`text-[12px] font-medium ${skin.subtle} hover:text-red-600`}>Quitar</button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <button type="button" onClick={usarUbicacion} disabled={geo.loading}
                                            className={`h-12 px-3 text-[14px] font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${skin.dashed}`}>
                                            {geo.loading ? <Spinner /> : (
                                                <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" strokeWidth={1.8} /><path strokeLinecap="round" strokeWidth={1.8} d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" strokeWidth={1.8} /></svg>
                                            )}
                                            {geo.loading ? "Buscando..." : "Mi ubicación actual"}
                                        </button>
                                        <button type="button" onClick={() => setMapa(true)}
                                            className={`h-12 px-3 text-[14px] font-medium inline-flex items-center justify-center gap-2 transition-colors ${skin.dashed}`}>
                                            <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
                                            Elegir en el mapa
                                        </button>
                                    </div>
                                )}
                                {mapa && (
                                    <MapPicker skin={skin} initial={punto} onClose={() => setMapa(false)}
                                        onPick={(p) => { setPunto(p); setMapa(false); setGeo({ loading: false, error: null }); }} />
                                )}
                                {geo.error && <p className="text-[12px] text-red-600 dark:text-red-400">{geo.error}</p>}
                            </div>
                        )}
                    </section>

                    {/* ── Pago ── */}
                    <section className="space-y-3">
                        <Paso n={2} skin={skin}>Cómo pagas</Paso>
                        {opciones.length ? (
                            <PaymentFields options={opciones} value={pago} onChange={setPago} owedBase={total} skin={skin}
                                later={puedeDespues ? { label: etiquetaDespues, selected: alRecibir, onSelect: setAlRecibir } : null} />
                        ) : (
                            <p className={`text-[14px] ${skin.muted}`}>
                                {modo === "delivery" ? "Pagas al recibir el pedido." : "Pagas al retirar el pedido."}
                            </p>
                        )}
                    </section>

                    <label className="block space-y-3">
                        <Paso n={3} skin={skin} extra={<span className={`text-[12px] ${skin.subtle}`}>Opcional</span>}>Nota para la tienda</Paso>
                        <textarea value={nota} onChange={e => setNota(e.target.value.slice(0, 300))} rows={2}
                            placeholder="Hora de entrega, algo que debamos saber"
                            className={`${skin.field} h-auto py-2.5 resize-none`} />
                    </label>
                </div>

                <div className={`shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ${skin.line} space-y-3 ${skin.carta ? "bg-white/50" : ""}`}>
                    <dl className="space-y-1 text-[13px]">
                        <div className="flex justify-between gap-3">
                            <dt className={skin.subtle}>Productos</dt>
                            <dd><Money value={fmt(cartTotal, baseCur)} className={skin.ink} /></dd>
                        </div>
                        {modo === "delivery" && (
                            <div className="flex justify-between gap-3">
                                <dt className={skin.subtle}>Delivery{zonaSel ? ` · ${zonaSel.name}` : ""}</dt>
                                <dd>{zonaSel || !checkout.zones.length
                                    ? <Money value={recargo > 0 ? fmt(recargo, baseCur) : "Sin costo"} className={skin.ink} />
                                    : <span className={skin.subtle}>Elige la zona</span>}</dd>
                            </div>
                        )}
                        <div className="flex justify-between items-baseline gap-3 pt-1">
                            <dt className={`text-[14px] font-semibold ${skin.ink}`}>Total</dt>
                            <dd className="text-right">
                                <Money value={fmt(total, baseCur)} className={`block text-[22px] font-bold tracking-tight ${skin.ink}`} />
                                {altCur && <Money value={fmt(total, altCur)} className={`block text-[12px] ${skin.subtle}`} />}
                            </dd>
                        </div>
                    </dl>
                    {(falta || sendError) && (
                        <p className="text-[13px] font-medium text-red-600 dark:text-red-400 leading-snug">{falta || sendError}</p>
                    )}
                    <button onClick={enviar} disabled={sending}
                        className={`w-full h-12 inline-flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60 ${skin.primary}`}>
                        {sending && <Spinner />}
                        {sending ? "Enviando..." : `Enviar pedido · ${fmt(total, baseCur)}`}
                        {!sending && skin.carta && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-6-6l6 6-6 6" /></svg>
                        )}
                    </button>
                </div>
        </CatalogSheet>
    );
}
