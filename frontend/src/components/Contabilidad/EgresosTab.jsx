import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { fmtDateShort } from "../../helpers";
import Page from "../ui/Page";
import DateRangePicker from "../ui/DateRangePicker";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";

const STATUS_BADGE = {
    activo:  "text-success border-success/30 bg-success/5",
    anulado: "text-content-subtle border-border/30 bg-surface-2 dark:bg-white/5",
};

const LIMIT = 50;

export default function EgresosTab({ notify, can, fmtPrice, journals }) {
    const [expenses, setExpenses] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [categories, setCategories] = useState([]);
    const [histDateFrom, setHistDateFrom] = useState("");
    const [histDateTo, setHistDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeCats, setActiveCats] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [voidConfirm, setVoidConfirm] = useState(null);

    // Modal de creación
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "" });
    const [saving, setSaving] = useState(false);

    const selectedJournal = form.payment_journal_id ? journals?.find(j => j.id == form.payment_journal_id) : null;
    const currentRate = selectedJournal?.exchange_rate || 1;
    const currentSymbol = selectedJournal?.currency_symbol || "$";

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Resetear página al cambiar filtros
    useEffect(() => { setPage(1); }, [debouncedSearch, histDateFrom, histDateTo, activeFilters, activeCats]);

    // Cargar categorías
    useEffect(() => {
        api.expenses.getCategories().then(r => setCategories(r.data || [])).catch(() => {});
    }, []);

    const loadExpenses = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (histDateFrom) params.date_from = histDateFrom;
            if (histDateTo)   params.date_to = histDateTo;
            if (debouncedSearch) params.search = debouncedSearch;
            if (activeFilters.length > 0) params.status = activeFilters[0];
            if (activeCats.length > 0)    params.category_id = activeCats[0];

            const r = await api.expenses.getAll(params);
            setExpenses(r.data);
            setTotal(r.total || 0);
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [histDateFrom, histDateTo, debouncedSearch, activeFilters, activeCats, page, notify]);

    useEffect(() => { loadExpenses(); }, [loadExpenses]);

    const toggleFilter = (id) => setActiveFilters(p => p.includes(id) ? [] : [id]);
    const toggleCat    = (id) => setActiveCats(p => p.includes(id) ? [] : [id]);

    const handleVoid = async (id) => {
        try { await api.expenses.void(id); notify("Egreso anulado"); loadExpenses(); }
        catch (e) { notify(e.message, "err"); }
    };

    const handleCreate = async () => {
        if (!form.description || !form.amount || !form.category_id) {
            return notify("Descripción, monto y categoría son obligatorios", "err");
        }
        setSaving(true);
        try {
            const inputAmount = parseFloat(form.amount);
            const baseAmount = currentRate !== 1 ? inputAmount / currentRate : inputAmount;

            await api.expenses.create({
                description: form.description,
                amount: baseAmount,
                category_id: parseInt(form.category_id),
                payment_journal_id: form.payment_journal_id ? parseInt(form.payment_journal_id) : null,
                reference: form.reference || null,
                notes: form.notes || null,
                currency_id: selectedJournal?.currency_id || null,
                rate: currentRate,
            });
            notify("Egreso registrado correctamente");
            setShowCreate(false);
            setForm({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "" });
            loadExpenses();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    const handleExportCSV = () => {
        const headers = ['Referencia', 'Fecha', 'Descripción', 'Categoría', 'Diario', 'Estado', 'Monto'];
        const rows = expenses.map(e => [
            e.reference || '-', fmtDateShort(e.created_at),
            e.description, e.category_name, e.journal_name || '-',
            e.status, e.amount,
        ]);
        exportToCSV('Historial_Egresos', rows, headers);
    };

    const hasFilters = activeFilters.length > 0 || activeCats.length > 0 || histDateFrom || histDateTo;
    const totalPages = Math.ceil(total / LIMIT);
    const startItem = (page - 1) * LIMIT + 1;
    const endItem = Math.min(page * LIMIT, total);

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar por descripción o referencia..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="input h-8 pl-8 text-[11px] w-full"
                />
            </div>

            {/* Filtros dropdown */}
            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={[
                        "h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
                        hasFilters
                            ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
                            : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">{activeFilters.length + activeCats.length + (histDateFrom || histDateTo ? 1 : 0)}</span>}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { id: 'activo',  label: 'Activo' },
                                        { id: 'anulado', label: 'Anulado' },
                                    ].map(f => (
                                        <button key={f.id} onClick={() => toggleFilter(f.id)}
                                            className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${activeFilters.includes(f.id) ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Categoría</div>
                                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                                    {categories.map(c => (
                                        <button key={c.id} onClick={() => toggleCat(c.id)}
                                            className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all truncate ${activeCats.includes(c.id) ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Rango de Fecha</div>
                                <DateRangePicker from={histDateFrom} to={histDateTo} setFrom={setHistDateFrom} setTo={setHistDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={() => { setActiveFilters([]); setActiveCats([]); setHistDateFrom(""); setHistDateTo(""); setSearchTerm(""); setShowFilterDrop(false); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button className="h-8 px-3 text-[10px] bg-surface-2 dark:bg-white/5 text-content-subtle border border-border/30 dark:border-white/10 hover:text-content shadow-none" onClick={handleExportCSV}>
                    CSV
                </Button>
                <Button className="h-8 px-3 text-[10px] bg-brand-500 text-black border border-brand-500 hover:bg-brand-400 shadow-none font-black uppercase tracking-wide" onClick={() => setShowCreate(true)}>
                    + Nuevo Egreso
                </Button>
            </div>
        </div>
    );

    return (
        <Page module="MÓDULO CONTABLE" title="Registro de Egresos" subheader={subheader}>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                            <tr>
                                {["Referencia", "Estado", "Descripción", "Categoría", "Diario", "Fecha", "Monto", "Acciones"].map(h => (
                                    <th key={h} className={`px-4 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : h === "Monto" ? "text-right" : ""}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">
                                        Sincronizando egresos...
                                    </td>
                                </tr>
                            ) : expenses.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">
                                        Sin egresos registrados
                                    </td>
                                </tr>
                            ) : expenses.map(exp => (
                                <tr key={exp.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] font-black text-brand-500 tracking-tight">{exp.reference || `#${exp.id}`}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${STATUS_BADGE[exp.status] || STATUS_BADGE.activo}`}>
                                            {exp.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-[200px]">
                                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate">{exp.description}</span>
                                        {exp.notes && (
                                            <div className="text-[9px] font-bold text-content-subtle opacity-50 mt-0.5 truncate">{exp.notes}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] font-black text-content-subtle uppercase tracking-wide">{exp.category_name}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{exp.journal_name || "—"}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] font-bold text-content-subtle uppercase">{fmtDateShort(exp.created_at)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex flex-col items-end">
                                            {exp.rate && exp.rate !== 1 ? (
                                                <>
                                                    <span className="text-[11px] font-black text-danger tabular-nums pb-0.5">
                                                        -{exp.currency_symbol} {(exp.amount * exp.rate).toFixed(2)}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-content-subtle opacity-60 tabular-nums">
                                                        -{fmtPrice(exp.amount)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-[11px] font-black text-danger tabular-nums pb-0.5">-{fmtPrice(exp.amount)}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {can("admin") && exp.status !== 'anulado' && (
                                                <button onClick={() => setVoidConfirm(exp)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                                                    title="Anular">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pie de Paginación Estándar */}
                {totalPages > 1 && (
                    <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                            Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                «
                            </button>
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                Anterior
                            </button>
                            <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                Pág {page}/{totalPages}
                            </div>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                Siguiente
                            </button>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(totalPages)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Crear Egreso */}
            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="REGISTRAR EGRESO" width={440}>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">Descripción *</label>
                        <input
                            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                            placeholder="Ej: Pago de electricidad"
                            value={form.description}
                            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">
                                Monto{currentSymbol ? ` (${currentSymbol})` : ""} *
                            </label>
                            <div className="relative">
                                {currentSymbol && (
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-content-subtle dark:text-white/30 pointer-events-none">
                                        {currentSymbol}
                                    </span>
                                )}
                                <input
                                    type="number" step="0.01" min="0" placeholder="0.00"
                                    className={`w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl text-[13px] font-bold text-content dark:text-white tabular-nums outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20 ${currentSymbol ? "pl-8 pr-3.5" : "px-3.5"}`}
                                    value={form.amount}
                                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">Referencia</label>
                            <input
                                className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                                placeholder="Factura / Recibo"
                                value={form.reference}
                                onChange={e => setForm(p => ({ ...p, reference: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">Categoría *</label>
                            <CustomSelect
                                value={form.category_id}
                                onChange={v => setForm(p => ({ ...p, category_id: v }))}
                                placeholder="Seleccionar..."
                                options={categories.map(c => ({ value: String(c.id), label: c.name }))}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">Diario de Pago</label>
                            <CustomSelect
                                value={form.payment_journal_id}
                                onChange={v => setForm(p => ({ ...p, payment_journal_id: v }))}
                                placeholder="Sin diario"
                                options={[{ value: "", label: "Sin diario" }, ...(journals || []).map(j => ({ value: String(j.id), label: j.name }))]}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest mb-1.5 block">Notas</label>
                        <textarea
                            className="w-full bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20 resize-none min-h-[72px]"
                            placeholder="Observaciones adicionales..."
                            value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                        />
                    </div>

                    <div className="flex gap-2.5 pt-2 border-t border-border/20 dark:border-white/5">
                        <button
                            onClick={() => setShowCreate(false)}
                            className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={saving}
                            className="flex-[2] h-10 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {saving ? "Guardando..." : "Registrar Egreso"}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!voidConfirm}
                title="¿Anular egreso?"
                message={`¿Estás seguro de que deseas anular el egreso "${voidConfirm?.description}"? Este proceso no se puede revertir.`}
                onConfirm={async () => { await handleVoid(voidConfirm.id); setVoidConfirm(null); }}
                onCancel={() => setVoidConfirm(null)}
                type="danger"
                confirmText="Sí, anular egreso"
            />
        </Page>
    );
}
