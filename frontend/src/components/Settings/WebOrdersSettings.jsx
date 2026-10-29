import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import ConfirmModal from "../ui/ConfirmModal";
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

const ZONA_VACIA = { name: "", price: "", warehouse_id: "" };

export default function WebOrdersSettings({ notify }) {
    const { triggerAction, can } = useApp();
    // Los métodos de cada cuenta se definen en su diario: desde aquí solo se publican.
    const irADiarios = can("journals.view") ? () => triggerAction("Contabilidad", "contabilidad:Diarios") : null;
    const [cfg, setCfg] = useState(null);
    const [warehouses, setWarehouses] = useState([]);
    const [zona, setZona] = useState(null);       // la que se edita; sin id = nueva
    const [borrar, setBorrar] = useState(null);
    // Borradores de cada método: { "9:pago_movil": { catalog_visible, catalog_info } }.
    const [metodos, setMetodos] = useState({});

    const load = async () => {
        try {
            const [r, w] = await Promise.all([api.catalogCheckout.get(), api.warehouses.getAll()]);
            setCfg(r.data);
            setWarehouses((w.data || []).filter(x => x.sells !== false));
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

    // ── Zonas ──
    const guardarZona = async () => {
        const body = { name: zona.name, price: zona.price || 0, warehouse_id: zona.warehouse_id || null };
        try {
            if (zona.id) await api.catalogCheckout.updateZone(zona.id, body);
            else await api.catalogCheckout.createZone(body);
            setZona(null);
            await load();
            notify("Zona guardada");
        } catch (e) { notify(e.message, "err"); }
    };
    const alternarZona = async (z) => {
        try { await api.catalogCheckout.updateZone(z.id, { active: !z.active }); await load(); }
        catch (e) { notify(e.message, "err"); }
    };
    const eliminarZona = async () => {
        try { await api.catalogCheckout.removeZone(borrar.id); setBorrar(null); await load(); notify("Zona eliminada"); }
        catch (e) { notify(e.message, "err"); }
    };

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

    const opcionesSucursal = [{ value: "", label: "Todas las sucursales" }, ...warehouses.map(w => ({ value: String(w.id), label: w.name }))];
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
                        <Interruptor titulo="Delivery" detalle="El cliente escribe su dirección y puede compartir su ubicación. El costo de la zona se suma al pedido."
                            checked={s.delivery} onChange={() => cambiarAjuste("delivery")} />
                    </div>
                </Seccion>

                {s.delivery && (
                    <Seccion titulo="Zonas de delivery" detalle="Cada zona con su precio en Ref. Sin zonas, el delivery no tiene costo.">
                        {cfg.zones.length > 0 && (
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] mb-3">
                                {cfg.zones.map(z => (
                                    <div key={z.id} className="px-4 py-3 flex items-center gap-3">
                                        <Check checked={z.active} onChange={() => alternarZona(z)} title={z.active ? "Ocultar zona" : "Ofrecer zona"} />
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-[13px] font-medium truncate ${z.active ? "text-content dark:text-white" : "text-content-subtle line-through"}`}>{z.name}</div>
                                            <div className="text-[12px] text-content-subtle truncate">{z.warehouse_name || "Todas las sucursales"}</div>
                                        </div>
                                        <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">
                                            {z.price > 0 ? `Ref. ${z.price.toFixed(2)}` : "Sin costo"}
                                        </span>
                                        <button type="button" onClick={() => setZona({ ...z, price: String(z.price), warehouse_id: z.warehouse_id ? String(z.warehouse_id) : "" })}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06]" title="Editar" aria-label={`Editar ${z.name}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.2 5.2l3.6 3.6M4 20l4.2-1 10.3-10.3a1.5 1.5 0 000-2.1l-1.1-1.1a1.5 1.5 0 00-2.1 0L5 15.8 4 20z" /></svg>
                                        </button>
                                        <button type="button" onClick={() => setBorrar(z)}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-red-600 hover:bg-red-500/10" title="Eliminar" aria-label={`Eliminar ${z.name}`}>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {zona ? (
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3">
                                    <label className="block min-w-0">
                                        <span className={LABEL}>Nombre</span>
                                        <input value={zona.name} onChange={e => setZona(p => ({ ...p, name: e.target.value }))} maxLength={80}
                                            placeholder="Ej. Centro, Los Palos Grandes" className={`${INPUT} mt-1.5`} autoComplete="off" />
                                    </label>
                                    <label className="block min-w-0">
                                        <span className={LABEL}>Precio</span>
                                        <div className="relative mt-1.5">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Ref.</span>
                                            <input value={zona.price} onChange={e => setZona(p => ({ ...p, price: e.target.value.replace(/[^\d.,]/g, "") }))}
                                                inputMode="decimal" placeholder="0.00" className={`${INPUT} pl-11 tabular-nums`} autoComplete="off" />
                                        </div>
                                    </label>
                                </div>
                                {warehouses.length > 1 && (
                                    <div>
                                        <span className={LABEL}>Sucursal que la ofrece</span>
                                        <CustomSelect value={zona.warehouse_id} onChange={v => setZona(p => ({ ...p, warehouse_id: v }))} options={opcionesSucursal} className="mt-1.5" />
                                    </div>
                                )}
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                                    <Button variant="ghost" className="h-12 sm:h-9" onClick={() => setZona(null)}>Cancelar</Button>
                                    <Button className="h-12 sm:h-9" onClick={guardarZona}>{zona.id ? "Guardar zona" : "Agregar zona"}</Button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setZona({ ...ZONA_VACIA })}
                                className="w-full h-10 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white hover:bg-surface-2/60 dark:hover:bg-white/[0.03] inline-flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                Agregar zona
                            </button>
                        )}
                    </Seccion>
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

            <ConfirmModal
                isOpen={!!borrar}
                title="Eliminar zona"
                message={borrar ? `La zona "${borrar.name}" deja de ofrecerse. Los pedidos que ya la usaron no cambian.` : ""}
                confirmText="Eliminar"
                onConfirm={eliminarZona}
                onCancel={() => setBorrar(null)}
            />
        </div>
    );
}
