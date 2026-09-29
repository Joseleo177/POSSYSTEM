import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import Modal from "./ui/Modal";
import ConfirmModal from "./ui/ConfirmModal";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { useApp } from "../context/AppContext";
import { fmtTime } from "../helpers/dates";

// Antes vivía como una pestaña más de Configuración Global. Se separó a su propio módulo
// porque tocar la tasa del día es una tarea de caja/administración, no de dueño de empresa:
// exigir el permiso de Configuración (que también abre RIF, dirección fiscal y facturación)
// solo para poder actualizar un tipo de cambio era pedir de más. El backend ya distinguía
// `currencies.view`/`currencies.manage` de `config.*` — lo que faltaba era que el frontend
// no los mezclara en una sola pantalla.
//
// La pantalla gira alrededor de su trabajo diario: poner la tasa. Cada divisa es una
// tarjeta con la tasa en grande, cuándo se tocó por última vez (en ámbar si no fue hoy:
// facturar con la tasa de ayer es el error caro aquí) y el botón para cambiarla.

const fmtRate = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const esHoy = (d) => {
    if (!d) return false;
    const x = new Date(d), h = new Date();
    return x.getFullYear() === h.getFullYear() && x.getMonth() === h.getMonth() && x.getDate() === h.getDate();
};
const cuando = (d) => {
    if (!d) return "sin fecha";
    return esHoy(d)
        ? `hoy a las ${fmtTime(d)}`
        : `el ${new Date(d).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
};

export default function MonedasTab({ notify }) {
    const { loadCurrencies, can } = useApp();
    const puedeEditar = can("currencies.manage");

    const [currencies, setCurrencies] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [newCurrency, setNewCurrency] = useState({ code: "", name: "", symbol: "", exchange_rate: "" });
    const [showNewCurrency, setShowNewCurrency] = useState(false);
    const [deleteCurrencyDialog, setDeleteCurrencyDialog] = useState(null);

    // Solo `/currencies`, nunca `/settings`: esta pantalla no necesita —ni debe pedir— los
    // datos de la empresa que vive detrás del permiso de Configuración.
    const load = async () => {
        try {
            const r = await api.currencies.getAll();
            setCurrencies(r.data);
        } catch (e) { notify(e.message, "err"); }
    };

    useEffect(() => { load(); }, []);

    const updateRate = async (id, rate) => {
        try {
            await api.currencies.updateRate(id, { exchange_rate: parseFloat(rate) });
            notify("Tipo de cambio actualizado correctamente");
            await load();
            loadCurrencies();
            return true;
        } catch (e) { notify(e.message, "err"); return false; }
    };

    const autoRefreshRates = async () => {
        setRefreshing(true);
        try {
            const res = await api.currencies.refreshRates();
            const names = res.updated.map(u => `${u.code}: ${fmtRate(u.rate)}`).join(" | ");
            notify(res.updated.length ? `Tasas actualizadas: ${names}` : "Las tasas ya están al día");
            setLastRefresh(new Date());
            setCurrencies(res.data);
            loadCurrencies();
        } catch (e) { notify(e.message || "Error al consultar la API de tasas", "err"); }
        finally { setRefreshing(false); }
    };

    const toggle = (c) => api.currencies.toggle(c.id)
        .then(() => { load(); loadCurrencies(); })
        .catch(e => notify(e.message, "err"));

    // Sin este candado, un doble clic (o Enter seguido del clic) daba de alta la misma
    // divisa dos veces.
    const [addingCurrency, setAddingCurrency] = useState(false);
    const addingRef = useRef(false);
    const addCurrency = async () => {
        if (addingRef.current) return;
        addingRef.current = true;
        setAddingCurrency(true);
        try {
            await api.currencies.create({ ...newCurrency, exchange_rate: parseFloat(String(newCurrency.exchange_rate).replace(",", ".")) });
            notify("Moneda agregada correctamente");
            setNewCurrency({ code: "", name: "", symbol: "", exchange_rate: "" });
            setShowNewCurrency(false);
            await load();
            loadCurrencies();
        } catch (e) { notify(e.message, "err"); }
        finally { addingRef.current = false; setAddingCurrency(false); }
    };

    const removeCurrency = async () => {
        try {
            await api.currencies.remove(deleteCurrencyDialog.id);
            notify("Moneda eliminada");
            setDeleteCurrencyDialog(null);
            await load();
            loadCurrencies();
        } catch (e) {
            notify(e.message, "err");
            setDeleteCurrencyDialog(null);
        }
    };

    const base = currencies.find(c => c.is_base);
    const divisas = currencies.filter(c => !c.is_base);

    const actions = puedeEditar ? (
        <>
            <Button variant="ghost" onClick={autoRefreshRates} disabled={refreshing} className="h-8 px-3"
                title="Consulta la tasa oficial del BCV y las demás divisas en línea">
                {!refreshing && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {refreshing ? "Consultando…" : "Sincronizar tasas"}
            </Button>
            <Button variant="ghost" onClick={() => setShowNewCurrency(true)} className="h-8 px-3">+ Nueva divisa</Button>
        </>
    ) : null;

    return (
        <Page module="Sistema" title="Monedas y tasas" actions={actions}>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar py-4">
                <div className="space-y-5 max-w-6xl">
                    {/* Moneda base: una línea de contexto, no un aviso. */}
                    {base && (
                        <p className="text-[13px] text-content-subtle">
                            Moneda base: <span className="font-semibold text-content dark:text-white">{base.name}</span> ({base.symbol} · {base.code}).
                            {" "}Todos los montos se guardan en esta moneda y se convierten con las tasas de abajo.
                            {lastRefresh && <span> Última sincronización hoy a las {fmtTime(lastRefresh)}.</span>}
                        </p>
                    )}

                    {divisas.length === 0 ? (
                        <div className="card-premium py-16 text-center">
                            <div className="text-[13px] font-semibold text-content dark:text-white">Solo trabajas con la moneda base</div>
                            <div className="text-[12px] text-content-subtle mt-1">Agrega una divisa para cobrar y mostrar precios en otra moneda.</div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {divisas.map(c => (
                                <RateCard key={c.id} c={c} base={base} puedeEditar={puedeEditar}
                                    onSave={updateRate} onToggle={() => toggle(c)} onDelete={() => setDeleteCurrencyDialog(c)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Nueva Divisa */}
            <Modal open={showNewCurrency} onClose={() => setShowNewCurrency(false)} title="Registrar nueva divisa" width={420}>
                <div className="space-y-3">
                    {[
                        ["Código ISO", "code", "text", "EUR"],
                        ["Nombre", "name", "text", "Euro"],
                        ["Símbolo", "symbol", "text", "€"],
                        [`Tasa (1 ${base?.code || "USD"} = ?)`, "exchange_rate", "text", "0,92"],
                    ].map(([label, key, type, placeholder], i) => (
                        <div key={key}>
                            <label className="label">{label}</label>
                            <input
                                autoFocus={i === 0}
                                value={newCurrency[key]}
                                onChange={e => setNewCurrency(p => ({ ...p, [key]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") addCurrency(); }}
                                type={type}
                                inputMode={key === "exchange_rate" ? "decimal" : undefined}
                                placeholder={placeholder}
                                className="input h-10 w-full"
                                autoComplete="off"
                            />
                        </div>
                    ))}
                    <button
                        onClick={addCurrency}
                        disabled={addingCurrency}
                        className="btn-accent w-full h-10 font-semibold text-[13px] rounded-lg transition-all active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {addingCurrency && <Spinner />}
                        {addingCurrency ? "Agregando…" : "Agregar divisa"}
                    </button>
                </div>
            </Modal>

            {/* Confirmar eliminación */}
            <ConfirmModal
                isOpen={!!deleteCurrencyDialog}
                title={`¿Eliminar ${deleteCurrencyDialog?.name || "moneda"}?`}
                message="Esta acción no se puede deshacer. Si la moneda tiene pagos o ventas asociadas no podrá eliminarse — en ese caso usa Suspender."
                onConfirm={removeCurrency}
                onCancel={() => setDeleteCurrencyDialog(null)}
                type="danger"
            />
        </Page>
    );
}

function RateCard({ c, base, puedeEditar, onSave, onToggle, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState("");
    const [saving, setSaving] = useState(false);

    const vieja = c.active && !esHoy(c.updated_at);
    const rate = parseFloat(c.exchange_rate) || 0;
    const baseCode = base?.code || "USD";
    const baseSym = base?.symbol || "Ref.";

    const abrir = () => { setVal(fmtRate(rate).replace(/\./g, "")); setEditing(true); };
    const guardar = async () => {
        const n = parseFloat(String(val).replace(/\./g, "").replace(",", "."));
        if (!(n > 0)) return;
        setSaving(true);
        const ok = await onSave(c.id, n);
        setSaving(false);
        if (ok) setEditing(false);
    };

    return (
        <article className={`card-premium flex flex-col ${c.active ? "" : "opacity-60"}`}>
            <div className="p-5 flex-1">
                {/* Encabezado */}
                <div className="flex items-center gap-3">
                    <span className="h-9 min-w-9 px-2 rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[12px] font-bold tracking-wide flex items-center justify-center">
                        {c.code}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-content dark:text-white truncate">{c.name}</div>
                        <div className="text-[12px] text-content-subtle">Símbolo {c.symbol}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 ${c.active ? "text-emerald-700 dark:text-emerald-400" : "text-content-subtle"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.active ? "bg-emerald-500" : "bg-content-subtle/50"}`} />
                        {c.active ? "Activa" : "Suspendida"}
                    </span>
                </div>

                {/* Tasa */}
                <div className="mt-6">
                    <div className="text-[12px] text-content-subtle">1 {baseCode} ({baseSym}) =</div>
                    {editing ? (
                        <div className="mt-2 flex items-center gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-medium text-content-subtle pointer-events-none">{c.symbol}</span>
                                <input
                                    autoFocus
                                    onFocus={e => e.target.select()}
                                    value={val}
                                    onChange={e => setVal(e.target.value.replace(/[^\d.,]/g, ""))}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") guardar();
                                        if (e.key === "Escape") setEditing(false);
                                    }}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    className="input h-12 w-full pl-12 !text-[22px] font-bold tabular-nums"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                            <span className="text-[16px] font-medium text-content-subtle">{c.symbol}</span>
                            <span className="text-[36px] leading-none font-bold tracking-tight text-content dark:text-white">{fmtRate(rate)}</span>
                        </div>
                    )}
                    <div className={`mt-3 flex items-center gap-1.5 text-[12px] ${vieja ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                        {vieja && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                        {vieja
                            ? <>No se ha actualizado hoy · última vez {cuando(c.updated_at)}</>
                            : <>Actualizada {cuando(c.updated_at)}</>}
                    </div>
                </div>
            </div>

            {/* Acciones, siempre visibles (tablets). */}
            {puedeEditar && (
                <div className="px-5 py-3 border-t border-border/60 dark:border-white/[0.06] flex items-center gap-2">
                    {editing ? (
                        <>
                            <button onClick={guardar} disabled={saving}
                                className="btn-accent flex-1 h-9 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60">
                                {saving && <Spinner />}
                                Guardar tasa
                            </button>
                            <button onClick={() => setEditing(false)} className="btn-outline h-9 px-4 rounded-lg text-[13px] font-medium">Cancelar</button>
                        </>
                    ) : (
                        <>
                            <button onClick={abrir} disabled={!c.active}
                                className="btn-accent flex-1 h-9 rounded-lg text-[13px] font-semibold active:scale-[0.99] disabled:!bg-surface-3 disabled:!bg-none disabled:!text-content-subtle disabled:!shadow-none dark:disabled:!bg-white/[0.06]">
                                Cambiar tasa
                            </button>
                            <button onClick={onToggle}
                                className="h-9 px-3 rounded-lg text-[13px] font-medium text-content-muted dark:text-white/60 hover:bg-surface-2 dark:hover:bg-white/[0.05] hover:text-content dark:hover:text-white transition-colors">
                                {c.active ? "Suspender" : "Habilitar"}
                            </button>
                            <button onClick={onDelete} className="row-icon w-9 h-9 hover:!text-red-600 dark:hover:!text-red-400 hover:!bg-red-500/10" title="Eliminar moneda" aria-label="Eliminar moneda">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}
