import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import MapPicker from "../PublicCatalog/MapPicker";
import { sheetSkin } from "../PublicCatalog/CatalogSheet";
import { toNameCase } from "../../helpers";
import Check from "../ui/Check";
import { useApp } from "../../context/AppContext";

// Configuración → Pedidos web: cómo entrega la tienda los pedidos del catálogo y con qué cuentas
// se los pueden pagar. Lo que el cliente reporta queda "por confirmar" hasta que aparece en un
// extracto o alguien lo confirma (Contabilidad → Pagos reportados).
//
// Las cuentas son los diarios de siempre: aquí solo se marca qué método de cada una ve el cliente
// y con qué datos (teléfono del pago móvil, número de cuenta, correo de Zelle).

const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const LABEL = "text-[12px] font-medium text-content-subtle";

// Métodos que se pagan en persona: no tienen sentido en un catálogo.
const PRESENCIALES = ["punto_venta", "biopago"];

const NOMBRE_METODO = { pago_movil: "pago móvil", transferencia: "transferencia" };

// Qué datos pide cada método para que el cliente pueda pagar desde su banco.
const CAMPOS = {
    pago_movil:    ["telefono", "documento", "titular"],
    transferencia: ["cuenta", "documento", "titular"],
    zelle:         ["correo", "titular"],
};
const CAMPOS_OTROS = ["cuenta", "correo", "documento", "titular"];
const ROTULO = {
    telefono: "Teléfono", documento: "Cédula o RIF", titular: "Titular",
    cuenta: "Número de cuenta", correo: "Correo",
};
const EJEMPLO = {
    telefono: "0414-5551234", documento: "J-12345678-9", titular: "Mi Tienda C.A.",
    cuenta: "0102 0000 00 0000000000", correo: "pagos@mitienda.com",
};

function Seccion({ titulo, detalle, children, aside = null }) {
    return (
        <section className={`${SECTION} p-4 sm:p-5`}>
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

function Interruptor({ titulo, detalle, checked, onChange }) {
    return (
        <label className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-surface-2/60 dark:hover:bg-white/[0.02] rounded-xl transition-colors">
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                <span className="block text-[12px] text-content-subtle mt-0.5 leading-snug">{detalle}</span>
            </span>
            <span className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={!!checked} onChange={onChange} />
                <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
            </span>
        </label>
    );
}

// Los cuatro números de la tarifa, como texto mientras se editan.
const tarifaTexto = (t) => Object.fromEntries(["base", "per_km", "min", "max_km"].map(k => [k, t?.[k] ? String(t[k]) : ""]));
const numero = (v) => Math.max(0, parseFloat(String(v || "").replace(",", ".")) || 0);

export default function WebOrdersSettings({ notify }) {
    const { triggerAction, can } = useApp();
    // Los métodos de cada cuenta se definen en su diario: desde aquí solo se publican.
    const irADiarios = can("journals.view") ? () => triggerAction("Contabilidad", "contabilidad:Diarios") : null;
    const [cfg, setCfg] = useState(null);
    const [tarifa, setTarifa] = useState(tarifaTexto(null));
    // Sucursal cuya ubicación se está marcando en el mapa.
    const [ubicando, setUbicando] = useState(null);
    // Borradores de cada método: { "9:pago_movil": { catalog_visible, catalog_info } }.
    const [metodos, setMetodos] = useState({});

    const load = async () => {
        try {
            const r = await api.catalogCheckout.get();
            setCfg(r.data);
            setTarifa(tarifaTexto(r.data.settings.tarifa));
            const m = {};
            for (const a of r.data.accounts) for (const x of a.methods) {
                m[`${a.journal_id}:${x.method_code}`] = {
                    catalog_visible: x.catalog_visible,
                    // El número de la cuenta ya está en el diario: se propone para no teclearlo dos veces.
                    catalog_info: { ...(x.method_code === "transferencia" && a.account_number ? { cuenta: a.account_number } : {}), ...x.catalog_info },
                    saved: JSON.stringify({ v: x.catalog_visible, i: x.catalog_info }),
                };
            }
            setMetodos(m);
        } catch (e) { notify(e.message, "err"); }
    };
    useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    if (!cfg) return <div className="h-40 rounded-2xl bg-surface-2 dark:bg-white/[0.03] animate-pulse" />;

    const s = cfg.settings;
    const cambiarAjuste = async (k) => {
        try {
            const r = await api.catalogCheckout.saveSettings({ [k]: !s[k] });
            setCfg(p => ({ ...p, settings: r.data }));
        } catch (e) { notify(e.message, "err"); }
    };

    // ── Tarifa y sucursales ──
    const guardada = tarifaTexto(s.tarifa);
    const tarifaSucia = JSON.stringify(tarifa) !== JSON.stringify(guardada);
    const guardarTarifa = async () => {
        try {
            const r = await api.catalogCheckout.saveSettings({ tarifa: Object.fromEntries(Object.entries(tarifa).map(([k, v]) => [k, numero(v)])) });
            setCfg(p => ({ ...p, settings: r.data }));
            setTarifa(tarifaTexto(r.data.tarifa));
            notify("Tarifa del delivery guardada");
        } catch (e) { notify(e.message, "err"); }
    };
    // Ejemplo con la tarifa en pantalla, para que se entienda qué pagará el cliente.
    const ejemplo = (km) => {
        const t = Object.fromEntries(Object.entries(tarifa).map(([k, v]) => [k, numero(v)]));
        if (t.max_km > 0 && km > t.max_km) return "No llega";
        return `Ref. ${Math.max(t.min, t.base + km * t.per_km).toFixed(2)}`;
    };
    const guardarUbicacion = async (w, punto) => {
        try {
            await api.catalogCheckout.saveWarehouseLocation(w.id, punto ? { lat: punto.lat, lng: punto.lng } : { lat: null, lng: null });
            setUbicando(null);
            await load();
            notify(punto ? `Ubicación de ${toNameCase(w.name)} guardada` : `Ubicación de ${toNameCase(w.name)} quitada`);
        } catch (e) { notify(e.message, "err"); }
    };
    const sinUbicacion = (cfg.warehouses || []).filter(w => w.lat == null).length;

    // ── Métodos ──
    const setMetodo = (key, patch) => setMetodos(p => ({ ...p, [key]: { ...p[key], ...patch } }));
    const setDato = (key, campo, valor) => setMetodos(p => ({ ...p, [key]: { ...p[key], catalog_info: { ...p[key].catalog_info, [campo]: valor } } }));
    const guardarMetodo = async (journalId, code) => {
        const key = `${journalId}:${code}`;
        const m = metodos[key];
        try {
            const r = await api.catalogCheckout.saveMethod(journalId, code, { catalog_visible: m.catalog_visible, catalog_info: m.catalog_info });
            setMetodo(key, { catalog_info: r.data.catalog_info, saved: JSON.stringify({ v: r.data.catalog_visible, i: r.data.catalog_info }) });
            notify(r.data.catalog_visible ? "Método publicado en el catálogo" : "Método oculto del catálogo");
        } catch (e) { notify(e.message, "err"); }
    };

    const cuentas = cfg.accounts
        .map(a => ({ ...a, metodosTodos: a.methods.map(m => m.method_code), methods: a.methods.filter(m => !PRESENCIALES.includes(m.method_code)) }))
        .filter(a => a.methods.length);
    const publicados = Object.values(metodos).filter(m => m.catalog_visible && JSON.parse(m.saved).v).length;

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start">
            <div className="space-y-4">
                <Seccion titulo="Entrega" detalle="Cómo recibe el cliente su pedido. Elige al menos una.">
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                        <Interruptor titulo="Retiro en tienda" detalle="El cliente lo busca en la sucursal donde pidió."
                            checked={s.pickup} onChange={() => cambiarAjuste("pickup")} />
                        <Interruptor titulo="Delivery" detalle="El cliente marca en el mapa dónde entregar y el costo se calcula por la distancia desde la sucursal."
                            checked={s.delivery} onChange={() => cambiarAjuste("delivery")} />
                    </div>
                </Seccion>

                {s.delivery && (
                    <Seccion titulo="Tarifa del delivery" detalle={`Se mide en línea recta desde la sucursal y se multiplica por ${String(cfg.street_factor || 1.3).replace(".", ",")} por las vueltas de las calles.`}>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ["base", "Base", "Ref.", "Lo que cuesta salir"],
                                ["per_km", "Por km", "Ref.", "Se suma por cada km"],
                                ["min", "Mínimo", "Ref.", "Nunca menos de esto"],
                                ["max_km", "Hasta", "km", "Vacío = sin límite"],
                            ].map(([k, rotulo, prefijo, ayuda]) => (
                                <label key={k} className="block min-w-0">
                                    <span className={LABEL}>{rotulo}</span>
                                    <div className="relative mt-1.5">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{prefijo}</span>
                                        <input value={tarifa[k]} onChange={e => setTarifa(p => ({ ...p, [k]: e.target.value.replace(/[^\d.,]/g, "") }))}
                                            inputMode="decimal" placeholder={k === "max_km" ? "" : "0.00"} autoComplete="off" className={`${INPUT} ${prefijo === "km" ? "pl-10" : "pl-11"} tabular-nums`} />
                                    </div>
                                    <span className="block mt-1 text-[11px] text-content-subtle">{ayuda}</span>
                                </label>
                            ))}
                        </div>
                        {/* Cuánto pagaría el cliente a distintas distancias, con lo que hay en pantalla. */}
                        <div className="mt-3 rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3 grid grid-cols-4 gap-2 text-center">
                            {[1, 3, 5, 10].map(km => (
                                <div key={km} className="min-w-0">
                                    <div className="text-[11px] text-content-subtle">A {km} km</div>
                                    <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">{ejemplo(km)}</div>
                                </div>
                            ))}
                        </div>
                        {tarifaSucia && (
                            <div className="mt-3 flex justify-end">
                                <Button className="h-12 sm:h-9 w-full sm:w-auto" onClick={guardarTarifa}>Guardar tarifa</Button>
                            </div>
                        )}
                    </Seccion>
                )}

                {s.delivery && (
                    <Seccion titulo="Ubicación de las sucursales" detalle="Desde aquí se mide la distancia. Una sucursal sin ubicación no ofrece delivery.">
                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {(cfg.warehouses || []).map(w => {
                                const marcada = w.lat != null && w.lng != null;
                                return (
                                    <div key={w.id} className={`px-4 py-3 flex items-center gap-3 ${marcada ? "" : "shadow-[inset_3px_0_0_#f59e0b]"}`}>
                                        <svg className={`w-5 h-5 shrink-0 ${marcada ? "text-emerald-600 dark:text-emerald-400" : "text-content-subtle"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" strokeWidth={1.8} /></svg>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(w.name)}</div>
                                            <div className={`text-[12px] ${marcada ? "text-content-subtle" : "text-amber-700 dark:text-amber-400"}`}>
                                                {marcada ? "Ubicación marcada" : "Sin ubicación: no ofrece delivery"}
                                            </div>
                                        </div>
                                        {marcada && (
                                            <a href={`https://www.google.com/maps?q=${w.lat},${w.lng}`} target="_blank" rel="noopener noreferrer"
                                                className="hidden sm:inline text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">Ver</a>
                                        )}
                                        <Button variant="ghost" className="h-10 sm:h-8 shrink-0" onClick={() => setUbicando(w)}>
                                            {marcada ? "Cambiar" : "Marcar en el mapa"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                        {sinUbicacion > 0 && (cfg.warehouses || []).length > sinUbicacion && (
                            <p className="mt-2 text-[12px] text-content-subtle">Los clientes de las sucursales sin ubicación solo pueden retirar.</p>
                        )}
                    </Seccion>
                )}

                {ubicando && (
                    <MapPicker skin={sheetSkin(null)} initial={ubicando.lat != null ? { lat: ubicando.lat, lng: ubicando.lng } : null}
                        titulo={`Ubicación de ${toNameCase(ubicando.name)}`} ayuda="Mueve el mapa hasta que el pin quede en la puerta de la sucursal" accion="Guardar ubicación"
                        onClose={() => setUbicando(null)} onPick={(p) => guardarUbicacion(ubicando, p)} />
                )}

                <Seccion titulo="Cobro" detalle="Si el cliente puede enviar el pedido sin pagar en línea.">
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08]">
                        <Interruptor titulo="Pagar al recibir o al retirar"
                            detalle="Apagado, el pedido solo se envía con un pago reportado. Sin métodos publicados, siempre se paga al recibir."
                            checked={s.pay_later} onChange={() => cambiarAjuste("pay_later")} />
                    </div>
                </Seccion>
            </div>

            <Seccion titulo="Cómo te pagan" detalle="Marca qué métodos de cada cuenta ve el cliente y los datos que necesita para pagarte."
                aside={<span className="text-[12px] text-content-subtle whitespace-nowrap">{publicados} {publicados === 1 ? "publicado" : "publicados"}</span>}>
                {cuentas.length === 0 ? (
                    <div className="py-8 text-center">
                        <div className="w-11 h-11 mx-auto rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M5 10V20h14V10M3 10l9-6 9 6" /></svg>
                        </div>
                        <p className="mt-3 text-[14px] font-medium text-content dark:text-white">Sin cuentas bancarias</p>
                        <p className="text-[12px] text-content-subtle mt-0.5">Crea una cuenta con pago móvil o transferencia en Diarios de pago.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cuentas.map(a => (
                            <div key={a.journal_id} className="rounded-xl border border-border/70 dark:border-white/[0.08]">
                                <div className="px-4 py-3 border-b border-border/60 dark:border-white/[0.06]">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[13px] font-semibold text-content dark:text-white truncate">{a.name}</span>
                                        <span className="text-[12px] text-content-subtle shrink-0">{a.currency_code || "Ref."}</span>
                                    </div>
                                    <div className="text-[12px] text-content-subtle truncate">
                                        {[a.bank_name, a.account_number, a.warehouses || "Todas las sucursales"].filter(Boolean).join(" · ")}
                                    </div>
                                </div>
                                <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-b border-border/60 dark:border-white/[0.06]">
                                    {a.methods.map(x => {
                                        const key = `${a.journal_id}:${x.method_code}`;
                                        const m = metodos[key] || { catalog_visible: false, catalog_info: {} };
                                        const campos = CAMPOS[x.method_code] || CAMPOS_OTROS;
                                        const sucio = JSON.stringify({ v: m.catalog_visible, i: m.catalog_info }) !== m.saved;
                                        return (
                                            <div key={key} className="px-4 py-3">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <Check checked={m.catalog_visible} onChange={v => setMetodo(key, { catalog_visible: v })} title="Mostrar en el catálogo" />
                                                    <span className="flex-1 min-w-0 text-[13px] font-medium text-content dark:text-white">{x.method_name}</span>
                                                    {!sucio && x.catalog_visible && (
                                                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            Publicado
                                                        </span>
                                                    )}
                                                </label>
                                                {m.catalog_visible && (
                                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {campos.map(c => (
                                                            <label key={c} className="block min-w-0">
                                                                <span className={LABEL}>{ROTULO[c]}</span>
                                                                <input value={m.catalog_info?.[c] || ""} onChange={e => setDato(key, c, e.target.value)}
                                                                    placeholder={EJEMPLO[c]} className={`${INPUT} mt-1.5`} autoComplete="off" />
                                                            </label>
                                                        ))}
                                                        <label className="block min-w-0 sm:col-span-2">
                                                            <span className="flex items-baseline justify-between">
                                                                <span className={LABEL}>Instrucciones</span>
                                                                <span className="text-[11px] text-content-subtle/70">Opcional</span>
                                                            </span>
                                                            <textarea value={m.catalog_info?.instrucciones || ""} onChange={e => setDato(key, "instrucciones", e.target.value)} rows={2} maxLength={300}
                                                                placeholder="Ej. Envía el pago desde una cuenta a tu nombre"
                                                                className={`${INPUT} h-auto py-2 mt-1.5 resize-none`} />
                                                        </label>
                                                    </div>
                                                )}
                                                {sucio && (
                                                    <div className="mt-3 flex justify-end">
                                                        <Button className="h-12 sm:h-9 w-full sm:w-auto" onClick={() => guardarMetodo(a.journal_id, x.method_code)}>
                                                            {m.catalog_visible ? "Guardar y publicar" : "Guardar"}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* La lista sale de los métodos del diario: si falta uno (lo normal es pago
                                    móvil y transferencia), se agrega a la cuenta en Diarios y vuelve aquí. */}
                                <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                                    <span className="text-[12px] text-content-subtle min-w-0">
                                        {(() => {
                                            const tiene = new Set(a.metodosTodos);
                                            const faltan = ["pago_movil", "transferencia"].filter(c => !tiene.has(c)).map(c => NOMBRE_METODO[c]);
                                            return faltan.length
                                                ? `¿Recibes ${faltan.join(" o ")} en esta cuenta? Agrégalo en su diario.`
                                                : "Para otro método, agrégalo en el diario de la cuenta.";
                                        })()}
                                    </span>
                                    {irADiarios && (
                                        <button type="button" onClick={irADiarios}
                                            className="shrink-0 text-[12px] font-semibold text-brand-600 dark:text-brand-400 hover:underline underline-offset-2 whitespace-nowrap">
                                            Ir a Diarios
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Seccion>
        </div>
    );
}
