import { useState, useRef } from "react";
import { useEgresos } from "../../hooks/contabilidad/useEgresos";
import FilterPopover from "../ui/FilterPopover";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { fmtDateShort, journalsForWarehouse } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, JournalDot, RowIcon } from "../ui/Ledger";
import DateRangePicker from "../ui/DateRangePicker";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import Pagination from "../ui/Pagination";
import RateField from "../ui/RateField";
import { useApp } from "../../context/AppContext";
import MovementDetailModal from "./MovementDetailModal";
import JournalPickerButton from "../cobro/JournalPickerButton";

// Registrado es lo normal: va en gris. El color queda para lo que pide atención.
const MOVEMENT_STATUS = {
    activo:  { label: "Registrado", tone: "success", quiet: "check" },
    anulado: { label: "Anulado",    tone: "neutral", quiet: "void" },
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
        deleteConfirm, setDeleteConfirm,
        showCreate, setShowCreate,
        form, setForm, saving,
        warehouses,
        currentSymbol, currentRate, configuredRate, baseEquivalent, selectedJournal,
        toggleFilter, toggleCat, clearFilters,
        handleVoid, handleDelete, handleCreate,
        hasFilters, totalPages,
    } = useEgresos({ notify, journals });

    const [detail, setDetail] = useState(null);
    const filtrosBtnRef = useRef(null);
    const { baseCurrency } = useApp();
    const baseSym = baseCurrency?.symbol || "Ref.";

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar por descripción o referencia..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="input h-9 pl-9 w-full"
                />
            </div>

            <div className="relative">
                <button
                    ref={filtrosBtnRef}
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={[
                        "h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
                        hasFilters
                            ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
                            : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && (
                        <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">
                            {activeFilters.length + activeCats.length + (histDateFrom || histDateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                <FilterPopover open={showFilterDrop} onClose={() => setShowFilterDrop(false)} anchorRef={filtrosBtnRef}>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[{ id: 'activo', label: 'Activo' }, { id: 'anulado', label: 'Anulado' }].map(f => (
                                        <button key={f.id} onClick={() => toggleFilter(f.id)}
                                            className={`h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${activeFilters.includes(f.id) ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Categoría</div>
                                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                                    {categories.map(c => (
                                        <button key={c.id} onClick={() => toggleCat(c.id)}
                                            className={`h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all truncate ${activeCats.includes(c.id) ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                                <DateRangePicker from={histDateFrom} to={histDateTo} setFrom={setHistDateFrom} setTo={setHistDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={clearFilters} className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                </FilterPopover>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button className="h-8 px-3 text-[11px]" onClick={() => setShowCreate(true)}>
                    + Nuevo egreso
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {subheader}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Referencia</th>
                                <th>Estado</th>
                                <th>Descripción</th>
                                <th>Categoría</th>
                                <th>Diario</th>
                                <th>Fecha</th>
                                <th className="text-right">Monto</th>
                                <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <LedgerSkeleton cols={8} />
                            ) : expenses.length === 0 ? (
                                <LedgerEmpty cols={8} title="Sin egresos" hint="No hay egresos registrados con estos filtros." />
                            ) : expenses.map(exp => {
                                const anulado = exp.status === "anulado";
                                return (
                                    <tr key={exp.id} {...ledgerRow(() => setDetail(exp))}>
                                        <td className="pl-4">
                                            <span className={`text-[13px] font-semibold tabular-nums ${anulado ? "text-content-subtle line-through decoration-1" : "text-brand-700 dark:text-brand-300"}`}>{exp.reference || `#${exp.id}`}</span>
                                        </td>
                                        <td><StatusMark status={exp.status} map={MOVEMENT_STATUS} /></td>
                                        <td className="max-w-0">
                                            <span className={`block truncate font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`}>{exp.description}</span>
                                            {exp.notes && <div className="text-[12px] text-content-subtle truncate">{exp.notes}</div>}
                                        </td>
                                        <td><span className="text-[12px] font-medium text-content-subtle">{exp.category_name || "—"}</span></td>
                                        <td>{exp.journal_name ? <JournalDot name={exp.journal_name} color={exp.journal_color} /> : <span className="text-content-subtle">—</span>}</td>
                                        <td><span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(exp.date ?? exp.created_at)}</span></td>
                                        <td className="text-right">
                                            {exp.rate && exp.rate !== 1 ? (
                                                <>
                                                    <Money value={`-${exp.currency_symbol} ${(exp.amount * exp.rate).toFixed(2)}`} strike={anulado} className={`text-[14px] font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`} />
                                                    <div><Money value={`-${fmtPrice(exp.amount)}`} className="text-[12px] text-content-subtle" /></div>
                                                </>
                                            ) : (
                                                <Money value={`-${fmtPrice(exp.amount)}`} strike={anulado} className={`text-[14px] font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`} />
                                            )}
                                        </td>
                                        <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                {can("admin") && !anulado && (
                                                    <RowIcon icon="ban" tone="danger" title="Anular" onClick={() => setVoidConfirm(exp)} />
                                                )}
                                                {can("admin") && anulado && (
                                                    <RowIcon icon="trash" tone="danger" title="Eliminar permanentemente" onClick={() => setDeleteConfirm(exp)} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Registrar egreso" width={440}>
                <div className="space-y-4">
                    <div>
                        <label className="label">Descripción *</label>
                        <input className="input" placeholder="Ej: Pago de electricidad" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    {/* Sucursal primero: el diario se elige de la lista ya filtrada por ella. */}
                    <div className={warehouses.length > 1 ? "grid grid-cols-2 gap-3" : ""}>
                        {warehouses.length > 1 && (
                            <div>
                                <label className="label">Sucursal *</label>
                                <CustomSelect
                                    value={form.warehouse_id}
                                    onChange={v => setForm(p => {
                                        const j = (journals || []).find(x => String(x.id) === String(p.payment_journal_id));
                                        const sigueValido = j && (!(j.warehouse_ids?.length) || j.warehouse_ids.includes(Number(v)));
                                        return { ...p, warehouse_id: v, payment_journal_id: sigueValido ? p.payment_journal_id : "", rate: sigueValido ? p.rate : "" };
                                    })}
                                    placeholder="Seleccionar..."
                                    options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
                                />
                            </div>
                        )}
                        <div>
                            <label className="label">Fecha del movimiento</label>
                            <input type="date" className="input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Monto{currentSymbol ? ` (${currentSymbol})` : ""} *</label>
                            <div className="relative">
                                {currentSymbol && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-content-subtle dark:text-white/30 pointer-events-none whitespace-nowrap">{currentSymbol}</span>}
                                <input type="number" step="0.01" min="0" placeholder="0.00"
                                    className={`input ${currentSymbol ? "pl-12" : ""}`}
                                    value={form.amount}
                                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                                />
                            </div>
                            {currentRate !== 1 && (
                                <p className="text-[11px] font-semibold text-content-subtle dark:text-white/30 tabular-nums mt-1">
                                    ≈ {baseSym}{baseEquivalent.toFixed(2)}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="label">Referencia</label>
                            <input className="input" placeholder="Factura / recibo" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Categoría *</label>
                            <CustomSelect value={form.category_id} onChange={v => setForm(p => ({ ...p, category_id: v }))} placeholder="Seleccionar..." options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
                        </div>
                        <div>
                            <label className="label">Diario de Pago</label>
                            {/* Al cambiar de diario se limpia la tasa tecleada: pertenecía a la
                                moneda anterior y aplicarla a otra convertiría mal el monto. */}
                            <JournalPickerButton
                                value={form.payment_journal_id}
                                journals={journalsForWarehouse(journals || [], form.warehouse_id)}
                                outflowOnly
                                disabled={warehouses.length > 1 && !form.warehouse_id}
                                onSelect={j => setForm(p => ({ ...p, payment_journal_id: String(j.id), rate: "" }))}
                                onClear={() => setForm(p => ({ ...p, payment_journal_id: "", rate: "" }))}
                                placeholder={warehouses.length > 1 && !form.warehouse_id ? "Elige la sucursal primero" : "Sin diario"}
                                methodPrompt={{ tag: "Egreso", title: "¿De qué caja sale?" }}
                            />
                        </div>
                    </div>

                    {/* Tasa del pago. Solo aparece con diarios en moneda distinta a la base. */}
                    {configuredRate !== 1 && (
                        <div>
                            <label className="label">Tasa del Pago</label>
                            <RateField
                                value={form.rate}
                                onChange={v => setForm(p => ({ ...p, rate: v }))}
                                configuredRate={configuredRate}
                                currency={{ code: selectedJournal?.currency_code }}
                            />
                        </div>
                    )}
                    <div>
                        <label className="label">Notas</label>
                        <textarea className="input resize-none" rows={1} placeholder="Observaciones..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                        <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                        <Button className="flex-[2]" onClick={handleCreate} disabled={saving}>
                            {saving ? "Guardando..." : "Registrar Egreso"}
                        </Button>
                    </div>
                </div>
            </Modal>
            <MovementDetailModal movement={detail} type="egreso" baseSym={baseSym} onClose={() => setDetail(null)} />


            <ConfirmModal
                isOpen={!!voidConfirm}
                title="¿Anular egreso?"
                message={`¿Estás seguro de que deseas anular el egreso "${voidConfirm?.description}"? Este proceso no se puede revertir.`}
                onConfirm={async () => { await handleVoid(voidConfirm.id); setVoidConfirm(null); }}
                onCancel={() => setVoidConfirm(null)}
                type="danger"
                confirmText="Sí, anular egreso"
            />

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar egreso?"
                message={`Esto eliminará permanentemente el egreso "${deleteConfirm?.description}". Esta acción no se puede deshacer.`}
                onConfirm={async () => { await handleDelete(deleteConfirm.id); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </div>
    );
}
