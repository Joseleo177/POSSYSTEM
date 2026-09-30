import CustomSelect from "../ui/CustomSelect";
import { isRateEdited } from "../ui/RateField";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";

const LABEL = "text-[12px] font-medium text-content-subtle mb-1.5 block";

// Datos de la orden nueva: a dónde llega, de quién, con qué factura y en qué moneda. Mismo
// diseño que la cabecera de una orden en borrador (PurchaseDetails), para que crear y editar
// se sientan la misma pantalla.
export default function ReceiptInfo({ state }) {
    const { baseCurrency, activeCurrencies } = useApp();
    const nonBaseCurrencies = (activeCurrencies || []).filter(c => !c.is_base);
    const {
        warehouses,
        selectedWarehouseId,
        setSelectedWarehouseId,

        selectedSupplier,
        setSelectedSupplier,

        supplierSearch,
        setSupplierSearch,
        supplierResults,
        selectSupplier,
        openCreateSupplier,

        notes,
        setNotes,

        invoiceCurrency,
        invoiceCurRate,
        invoiceRateInput,
        setInvoiceRateInput,
        selectInvoiceCurrency,
    } = state;

    const cols = 2 + (warehouses.length > 1 ? 1 : 0) + (nonBaseCurrencies.length > 0 ? 1 : 0);

    return (
        <div className="bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none p-5">
            <div className="mb-4">
                <p className="text-[14px] font-semibold text-content dark:text-white">Datos de la compra</p>
                <p className="text-[12px] text-content-subtle">El proveedor puede quedar para después: se pide al confirmar o recibir la orden.</p>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 ${cols >= 4 ? "xl:grid-cols-4" : cols === 3 ? "xl:grid-cols-3" : ""}`}>
                {/* Almacén. Con uno solo no hay nada que elegir: mostrarlo solo insinuaría que
                    hay más. `selectedWarehouseId` ya queda fijo en el único desde el hook. */}
                {warehouses.length > 1 && (
                    <div>
                        <label className={LABEL}>Almacén destino</label>
                        <CustomSelect
                            value={String(selectedWarehouseId || "")}
                            onChange={val => setSelectedWarehouseId(val)}
                            options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))}
                            placeholder="Elige el almacén"
                            className="w-full"
                            height="h-10"
                        />
                    </div>
                )}

                {/* Proveedor */}
                <div>
                    {/* El borrador se guarda sin proveedor —es el papel de trabajo donde se
                        arma la lista antes de decidir a quién comprarle—, pero confirmar o
                        recibir sí lo exige, así que se marca desde el principio. */}
                    <label className={LABEL}>Proveedor <span className="text-red-500">*</span></label>

                    {selectedSupplier ? (
                        <div className="h-10 flex items-center gap-2 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] pl-3 pr-1">
                            <span className="w-6 h-6 rounded-full bg-surface-3 dark:bg-white/[0.08] text-[11px] font-semibold text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                                {(selectedSupplier.name || "?").charAt(0).toUpperCase()}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-medium text-content dark:text-white truncate leading-tight">{toNameCase(selectedSupplier.name)}</span>
                                {selectedSupplier.rif && <span className="block text-[11px] text-content-subtle tabular-nums leading-tight">{selectedSupplier.rif}</span>}
                            </span>
                            <button
                                onClick={() => setSelectedSupplier(null)}
                                className="row-icon !w-7 !h-7 shrink-0"
                                title="Cambiar proveedor"
                                aria-label="Cambiar proveedor"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                                value={supplierSearch}
                                onChange={e => setSupplierSearch(e.target.value)}
                                placeholder="Buscar proveedor…"
                                autoComplete="off"
                                className="input h-10 pl-9 text-[13px]"
                            />

                            {supplierSearch.trim() !== "" && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border dark:border-white/10 rounded-xl shadow-[0_16px_40px_-12px_rgb(0_0_0/0.3)] p-1 max-h-[240px] overflow-y-auto popover-in">
                                    {supplierResults.map(s => (
                                        <button key={s.id} onClick={() => selectSupplier(s)}
                                            className="w-full text-left px-3 py-2 hover:bg-surface-2 dark:hover:bg-white/[0.05] rounded-lg transition-colors">
                                            <div className="text-[13px] font-medium text-content dark:text-white">{toNameCase(s.name)}</div>
                                            {s.rif && <div className="text-[12px] text-content-subtle tabular-nums">{s.rif}</div>}
                                        </button>
                                    ))}
                                    {supplierResults.length === 0 && (
                                        <p className="px-3 pt-2 pb-1 text-[12px] text-content-subtle">Ningún proveedor coincide.</p>
                                    )}
                                    {/* Crear siempre a mano: un proveedor nuevo no debería depender
                                        de que la búsqueda no encuentre nada. */}
                                    <button onClick={() => openCreateSupplier(supplierSearch)}
                                        className="w-full text-left px-3 py-2 mt-0.5 rounded-lg text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 flex items-center gap-2 border-t border-border/60 dark:border-white/[0.06]">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                                        Crear proveedor “{supplierSearch.trim()}”
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Notas */}
                <div>
                    <label className={LABEL}>Notas o factura del proveedor</label>
                    <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Ej: Factura 1234"
                        autoComplete="off"
                        className="input h-10 text-[13px]"
                    />
                </div>

                {/* Moneda y tasa de la factura del proveedor. Va en la cabecera, junto a la
                    referencia, porque es un dato de la compra —a cuánto se compró ese día— y
                    no una preferencia de visualización de la tabla. */}
                {nonBaseCurrencies.length > 0 && (
                    <div>
                        <label className={LABEL}>Moneda de la factura</label>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] h-10 shrink-0">
                                {[{ id: null, code: baseCurrency?.symbol || "Ref.", title: "Cargar costos en moneda base", cur: null },
                                  ...nonBaseCurrencies.map(c => ({ id: c.id, code: c.code, title: `Cargar costos en ${c.name}`, cur: c }))].map(o => {
                                    const on = o.id === null ? !invoiceCurrency : invoiceCurrency?.id === o.id;
                                    return (
                                        <button key={o.id ?? "base"} type="button" title={o.title}
                                            onClick={() => selectInvoiceCurrency(o.cur)}
                                            className={`h-full px-3 rounded-md text-[12px] transition-all ${on
                                                ? "bg-white dark:bg-white/15 font-semibold text-content dark:text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                                                : "font-medium text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                            {o.code}
                                        </button>
                                    );
                                })}
                            </div>
                            {invoiceCurrency && (
                                <div className="relative flex-1 min-w-0">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Tasa</span>
                                    <input
                                        value={invoiceRateInput}
                                        onChange={e => setInvoiceRateInput(e.target.value.replace(/[^\d.,]/g, ""))}
                                        placeholder={invoiceCurRate.toFixed(4)}
                                        title={`Tasa de configuración: ${invoiceCurRate.toFixed(4)}`}
                                        autoComplete="off"
                                        className={`input h-10 pl-11 text-[13px] tabular-nums text-right ${isRateEdited(invoiceRateInput, invoiceCurRate) ? "!border-amber-500/60" : ""}`}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
