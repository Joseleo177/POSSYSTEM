import { useState, useEffect } from "react";
import { api } from "../services/api";
import Page from "./ui/Page";
import Modal from "./ui/Modal";
import ConfirmModal from "./ui/ConfirmModal";
import { useApp } from "../context/AppContext";

// Antes vivía como una pestaña más de Configuración Global. Se separó a su propio módulo
// porque tocar la tasa del día es una tarea de caja/administración, no de dueño de empresa:
// exigir el permiso de Configuración (que también abre RIF, dirección fiscal y facturación)
// solo para poder actualizar un tipo de cambio era pedir de más. El backend ya distinguía
// `currencies.view`/`currencies.manage` de `config.*` — lo que faltaba era que el frontend
// no los mezclara en una sola pantalla.
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
        } catch (e) { notify(e.message, "err"); }
    };

    const autoRefreshRates = async () => {
        setRefreshing(true);
        try {
            const res = await api.currencies.refreshRates();
            const names = res.updated.map(u => `${u.code}: ${parseFloat(u.rate).toFixed(4)}`).join(" | ");
            notify(res.updated.length ? `Tasas actualizadas: ${names}` : "Las tasas ya están al día");
            setLastRefresh(new Date());
            setCurrencies(res.data);
            loadCurrencies();
        } catch (e) { notify(e.message || "Error al consultar la API de tasas", "err"); }
        finally { setRefreshing(false); }
    };

    const addCurrency = async () => {
        try {
            await api.currencies.create({ ...newCurrency, exchange_rate: parseFloat(newCurrency.exchange_rate) });
            notify("Moneda agregada correctamente");
            setNewCurrency({ code: "", name: "", symbol: "", exchange_rate: "" });
            setShowNewCurrency(false);
            await load();
            loadCurrencies();
        } catch (e) { notify(e.message, "err"); }
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

    return (
        <Page module="MÓDULO DE SISTEMA" title="Monedas y Tasas">
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-4">
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                    {base && (
                        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-0.5">Moneda Base</div>
                                <div className="text-[11px] font-black text-content dark:text-white uppercase">{base.name} ({base.symbol} {base.code})</div>
                                <div className="text-[9px] font-bold text-content-subtle opacity-60 uppercase tracking-widest">Tipo de cambio fijo en 1.0 · Base de todos los movimientos</div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white dark:bg-surface-dark-3 rounded-xl border border-border/40 dark:border-white/10 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between border-b border-border/10">
                            <span className="text-[10px] font-black uppercase tracking-widest text-content dark:text-white">Tipos de Cambio</span>
                            {puedeEditar && (
                                <div className="flex items-center gap-2">
                                    {lastRefresh && (
                                        <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest">Última actualización: {lastRefresh.toLocaleTimeString()}</span>
                                    )}
                                    <button
                                        onClick={autoRefreshRates}
                                        disabled={refreshing}
                                        className={`h-7 px-3 rounded-lg bg-info/10 text-info text-[10px] font-black uppercase tracking-widest border border-info/20 hover:bg-info hover:text-black transition-all ${refreshing ? "animate-pulse" : ""}`}
                                    >
                                        {refreshing ? "Sincronizando..." : "Sincronizar Online"}
                                    </button>
                                    <button
                                        onClick={() => setShowNewCurrency(true)}
                                        className="h-7 px-3 rounded-lg bg-warning/10 text-warning text-[10px] font-black uppercase tracking-widest border border-warning/20 hover:bg-warning hover:text-black transition-all"
                                    >
                                        + Nueva Divisa
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[560px]">
                                <thead>
                                    <tr className="bg-surface-2 dark:bg-white/[0.02]">
                                        {["Código", "Nombre", "Símbolo", "Tasa (1 USD =)", "Estado", ""].map(h => (
                                            <th key={h} className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-content-subtle">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10 text-[11px]">
                                    {currencies.map((c) => (
                                        <tr key={c.id} className="hover:bg-brand-500/[0.02] transition-colors">
                                            <td className="px-4 py-2 font-black text-brand-500">{c.code}</td>
                                            <td className="px-4 py-2 font-bold text-content dark:text-white uppercase truncate">{c.name}</td>
                                            <td className="px-4 py-2 font-black text-content-subtle">{c.symbol}</td>
                                            <td className="px-4 py-2">
                                                {c.is_base ? (
                                                    <span className="text-content-subtle font-black tracking-widest italic">1.000 (Base)</span>
                                                ) : puedeEditar ? (
                                                    <RateEditor currency={c} onSave={updateRate} />
                                                ) : (
                                                    <span className="text-content dark:text-white font-black tracking-widest">{parseFloat(c.exchange_rate).toFixed(4)}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${c.active ? "bg-success/10 text-success border-success/30" : "bg-danger/10 text-danger border-danger/30"}`}>
                                                    {c.active ? "Activa" : "Inactiva"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                {puedeEditar && !c.is_base && (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => api.currencies.toggle(c.id).then(() => { load(); loadCurrencies(); }).catch(e => notify(e.message, "err"))}
                                                            className={`h-6 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${c.active ? "bg-danger/10 text-danger border-danger/20 hover:bg-danger hover:text-white" : "bg-success/10 text-success border-success/20 hover:bg-success hover:text-black"}`}
                                                        >
                                                            {c.active ? "Suspender" : "Habilitar"}
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteCurrencyDialog(c)}
                                                            title="Eliminar moneda"
                                                            className="w-6 h-6 flex items-center justify-center rounded-lg text-content-subtle dark:text-white/30 hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 transition-all"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Modal: Nueva Divisa */}
                    <Modal open={showNewCurrency} onClose={() => setShowNewCurrency(false)} title="Registrar Nueva Divisa" width={420}>
                        <div className="space-y-3">
                            {[
                                ["Código ISO", "code", "text", "EUR"],
                                ["Nombre", "name", "text", "Euro"],
                                ["Símbolo", "symbol", "text", "€"],
                                ["Tasa vs USD", "exchange_rate", "number", "0.92"],
                            ].map(([label, key, type, placeholder], i) => (
                                <div key={key}>
                                    <label className="label">{label}</label>
                                    <input
                                        autoFocus={i === 0}
                                        value={newCurrency[key]}
                                        onChange={e => setNewCurrency(p => ({ ...p, [key]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === "Enter") addCurrency(); }}
                                        type={type}
                                        placeholder={placeholder}
                                        className="input h-9 w-full"
                                    />
                                </div>
                            ))}
                            <button
                                onClick={addCurrency}
                                className="w-full h-10 bg-warning text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:shadow-lg hover:shadow-warning/20 transition-all active:scale-95"
                            >
                                Agregar Divisa
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
                </div>
            </div>
        </Page>
    );
}

function RateEditor({ currency, onSave }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(currency.exchange_rate);

    if (!editing) return (
        <span
            onClick={() => { setVal(currency.exchange_rate); setEditing(true); }}
            className="cursor-pointer text-info border-b border-dashed border-info/50 hover:text-blue-400 transition-colors"
        >
            {parseFloat(currency.exchange_rate).toFixed(4)}
        </span>
    );

    const confirmar = () => { onSave(currency.id, val); setEditing(false); };

    return (
        <div className="flex gap-1.5 items-center">
            <input
                // Un solo clic para editar y ya: sin autoFocus, el clic que abría el campo lo
                // dejaba vacío de foco y había que volver a hacer clic adentro para escribir.
                // select() de paso deja el número entero listo para sobrescribir de un tirón.
                autoFocus
                onFocus={e => e.target.select()}
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => {
                    if (e.key === "Enter") confirmar();
                    if (e.key === "Escape") setEditing(false);
                }}
                type="number"
                step="0.000001"
                className="w-24 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg px-2 h-7 text-[11px] font-bold text-content dark:text-white outline-none focus:border-brand-500"
            />
            <button
                onClick={confirmar}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
            </button>
            <button
                onClick={() => setEditing(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-3 text-content-muted hover:bg-danger/10 hover:text-danger transition-all opacity-40 hover:opacity-100"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
}
