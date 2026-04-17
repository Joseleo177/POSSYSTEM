import { useEgresos } from "../../hooks/contabilidad/useEgresos";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { fmtDateShort } from "../../helpers";
import DateRangePicker from "../ui/DateRangePicker";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import Pagination from "../ui/Pagination";

const STATUS_BADGE = {
    activo:  "text-success border-success/30 bg-success/5",
    anulado: "text-content-subtle border-border/30 bg-surface-2 dark:bg-white/5",
};

export default function EgresosTab({ notify, can, fmtPrice, journals }) {
    const {
        expenses, total, page, setPage, loading, LIMIT,
        categories,
        histDateFrom, setHistDateFrom, histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeCats,
        showFilterDrop, setShowFilterDrop,
        voidConfirm, setVoidConfirm,
        showCreate, setShowCreate,
        form, setForm, saving,
        currentSymbol,
        toggleFilter, toggleCat, clearFilters,
        handleVoid, handleCreate, handleExportCSV,
        hasFilters, totalPages,
    } = useEgresos({ notify, journals });

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
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
                    {hasFilters && (
                        <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">
                            {activeFilters.length + activeCats.length + (histDateFrom || histDateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[{ id: 'activo', label: 'Activo' }, { id: 'anulado', label: 'Anulado' }].map(f => (
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
                                <button onClick={clearFilters} className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
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
                <Button className="h-8 px-3 text-[10px]" onClick={() => setShowCreate(true)}>
                    + Nuevo Egreso
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {subheader}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                            <tr>
                                {["Referencia", "Estado", "Descripción", "Categoría", "Diario", "Fecha", "Monto", "Acciones"].map(h => (
                                    <th key={h} className={`px-4 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" || h === "Monto" ? "text-right" : ""}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                            {loading ? (
                                <tr><td colSpan={8} className="px-6 py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Sincronizando egresos...</td></tr>
                            ) : expenses.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin egresos registrados</td></tr>
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
                                        {exp.notes && <div className="text-[9px] font-bold text-content-subtle opacity-50 mt-0.5 truncate">{exp.notes}</div>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] font-black text-content-subtle uppercase tracking-wide">{exp.category_name}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{exp.journal_name || "—"}</span>
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
                                                    <span className="text-[9px] font-bold text-content-subtle opacity-60 tabular-nums">-{fmtPrice(exp.amount)}</span>
                                                </>
                                            ) : (
                                                <span className="text-[11px] font-black text-danger tabular-nums pb-0.5">-{fmtPrice(exp.amount)}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end">
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

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="REGISTRAR EGRESO" width={440}>
                <div className="space-y-4">
                    <div>
                        <label className="label">Descripción *</label>
                        <input className="input" placeholder="Ej: Pago de electricidad" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Monto{currentSymbol ? ` (${currentSymbol})` : ""} *</label>
                            <div className="relative">
                                {currentSymbol && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-content-subtle dark:text-white/30 pointer-events-none">{currentSymbol}</span>}
                                <input type="number" step="0.01" min="0" placeholder="0.00"
                                    className={`input ${currentSymbol ? "pl-8" : ""}`}
                                    value={form.amount}
                                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="label">Referencia</label>
                            <input className="input" placeholder="Factura / Recibo" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Categoría *</label>
                            <CustomSelect value={form.category_id} onChange={v => setForm(p => ({ ...p, category_id: v }))} placeholder="Seleccionar..." options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
                        </div>
                        <div>
                            <label className="label">Diario de Pago</label>
                            <CustomSelect value={form.payment_journal_id} onChange={v => setForm(p => ({ ...p, payment_journal_id: v }))} placeholder="Sin diario" options={[{ value: "", label: "Sin diario" }, ...(journals || []).map(j => ({ value: String(j.id), label: j.name }))]} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Notas</label>
                        <textarea className="input resize-none min-h-[72px]" placeholder="Observaciones adicionales..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <div className="flex gap-2.5 pt-2 border-t border-border/20 dark:border-white/5">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                        <Button className="flex-[2]" onClick={handleCreate} disabled={saving}>
                            {saving ? "Guardando..." : "Registrar Egreso"}
                        </Button>
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
        </div>
    );
}
