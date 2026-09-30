import { useState } from "react";
import ReceiptInfo from "./ReceiptInfo";
import ProductSelectorModal from "./ProductSelectorModal";
import PurchaseItemsTable from "./PurchaseItemsTable";
import { useApp } from "../../context/AppContext";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// Orden de compra nueva. La tabla es la misma del detalle (PurchaseItemsTable): una orden
// recién creada y una en borrador se editan igual, con los mismos campos y el mismo lápiz
// para reabrir la línea en el selector.
export default function PurchaseForm({ state }) {
    const { items, removeItem, updateItem, grandTotal, savePurchase, loading, editingDraftId, selectedWarehouseId,
            receivingMode, setReceivingMode } = state;
    const { baseCurrency } = useApp();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    // Moneda y tasa con las que se CARGA la factura del proveedor. Viven en el hook porque se
    // guardan con la orden (columnas currency_id/exchange_rate) y se eligen en la cabecera,
    // junto a la referencia. La orden se sigue almacenando en moneda base: esto convierte la
    // captura para no obligar al comprador a dividir cada costo a mano.
    const { invoiceCurrency, invoiceRate } = state;
    const invoiceSym   = invoiceCurrency ? (invoiceCurrency.symbol || invoiceCurrency.code) : (baseCurrency?.symbol || "Ref.");
    const inInvoiceCur = invoiceRate > 1;

    // La tabla compartida lee los datos planos (como vienen del servidor); las líneas de la
    // orden nueva los traen dentro de `product`.
    const filas = items.map(i => ({
        ...i,
        product_name: i.product_name ?? i.product?.name,
        unit: i.unit ?? i.product?.unit,
        sellable: i.sellable ?? i.product?.sellable,
    }));

    const abrirEdicion = (key) => {
        const it = items.find(i => i.key === key);
        if (!it) return;
        // El selector espera la línea con los datos del producto planos.
        setEditing({ ...it, product_id: it.product?.id, product_name: it.product?.name, unit: it.product?.unit, stock: it.product?.stock, sellable: it.product?.sellable });
    };

    const handleAdd = (item) => {
        if (editing) {
            updateItem(editing.key, { ...item, key: editing.key, product: { ...editing.product, ...item.product } });
            setEditing(null);
        } else {
            state.addItemFromModal(item);
        }
    };

    const sinAlmacen = !selectedWarehouseId;

    return (
        <div className="space-y-3">
            <ReceiptInfo state={state} />

            <div className="bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-content dark:text-white">Productos de la orden</p>
                        <p className="text-[12px] text-content-subtle">
                            {items.length ? `${items.length} ${items.length === 1 ? "producto" : "productos"}` : "Todavía no hay productos"}
                        </p>
                    </div>
                    {items.length > 0 && (
                        <button
                            onClick={() => !sinAlmacen && setModalOpen(true)}
                            disabled={sinAlmacen}
                            title={sinAlmacen ? "Selecciona primero el almacén destino" : undefined}
                            className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                            Agregar<span className="hidden sm:inline"> producto</span>
                        </button>
                    )}
                </div>

                {items.length > 0 ? (
                    <PurchaseItemsTable
                        items={filas}
                        orderStatus="borrador"
                        onUpdate={updateItem}
                        onDelete={removeItem}
                        onEdit={abrirEdicion}
                        invoiceRate={invoiceRate}
                        invoiceSym={invoiceSym}
                    />
                ) : (
                    // Vacío: el botón de agregar va al centro, que es lo único que se puede hacer.
                    <div className="border-t border-border/60 dark:border-white/[0.06] py-14 px-6 flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-2xl bg-surface-2 dark:bg-white/[0.04] border border-border/70 dark:border-white/[0.08] flex items-center justify-center text-content-subtle">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <p className="mt-4 text-[15px] font-semibold text-content dark:text-white">Agrega lo que vas a comprar</p>
                        <p className="mt-1 text-[13px] text-content-subtle max-w-sm">
                            {sinAlmacen
                                ? "Primero elige el almacén al que va a llegar la mercancía."
                                : "Busca cada producto, indica cómo viene (bulto, caja…) y a cuánto lo compraste."}
                        </p>
                        <button
                            onClick={() => setModalOpen(true)}
                            disabled={sinAlmacen}
                            className="mt-5 btn-accent h-10 px-5 rounded-lg text-[13px] font-semibold flex items-center gap-2 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                            Agregar producto
                        </button>
                    </div>
                )}

                {/* Pie: modo recepción, total y guardar. El modo va pegado al botón porque cambia
                    lo que ese botón hace: con el interruptor puesto, guardar mete la mercancía al
                    inventario en vez de solo anotarla. */}
                {items.length > 0 && (
                    <div className="px-5 py-4 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.015] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="min-w-0 max-w-xl">
                            <button
                                type="button"
                                onClick={() => setReceivingMode?.(!receivingMode)}
                                aria-pressed={receivingMode}
                                className="flex items-start gap-3 text-left"
                            >
                                <span className={`mt-0.5 w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors ${receivingMode ? "bg-brand-500" : "bg-content-subtle/30 dark:bg-white/15"}`}>
                                    <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${receivingMode ? "translate-x-4" : ""}`} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold text-content dark:text-white">Ir recibiendo{receivingMode ? " · activado" : ""}</span>
                                    <span className="block text-[12px] text-content-subtle mt-0.5 leading-snug">
                                        {receivingMode
                                            ? "Al guardar, cada producto entra al stock de una vez. La orden queda abierta para seguir cargándola."
                                            : "La mercancía entra al stock solo cuando le des a “Recibir mercancía”."}
                                    </span>
                                </span>
                            </button>
                            {receivingMode && sinAlmacen && (
                                <p className="text-[12px] font-medium text-red-600 dark:text-red-400 mt-2 pl-12">
                                    Elige el almacén de destino y el proveedor: sin eso la mercancía no puede entrar.
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-between lg:justify-end gap-5 shrink-0">
                            <div className="lg:text-right">
                                <div className="text-[12px] text-content-subtle">Total de la orden</div>
                                {inInvoiceCur ? (
                                    <>
                                        <div className="text-[22px] font-bold tracking-tight text-content dark:text-white tabular-nums leading-tight">{invoiceSym} {fmt2(grandTotal * invoiceRate)}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(grandTotal)}</div>
                                    </>
                                ) : (
                                    <div className="text-[22px] font-bold tracking-tight text-content dark:text-white tabular-nums leading-tight">Ref. {fmt2(grandTotal)}</div>
                                )}
                            </div>
                            <button
                                onClick={savePurchase}
                                disabled={loading}
                                className="btn-accent h-11 px-5 rounded-xl text-[14px] font-semibold flex items-center gap-2 active:scale-[0.99] disabled:opacity-50"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                )}
                                {loading
                                    ? "Guardando…"
                                    : receivingMode
                                        ? "Guardar y cargar al stock"
                                        : editingDraftId ? "Actualizar borrador" : "Guardar borrador"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ProductSelectorModal
                open={modalOpen || !!editing}
                onClose={() => { setModalOpen(false); setEditing(null); }}
                onAdd={handleAdd}
                existingItems={items}
                editItem={editing}
                warehouseId={selectedWarehouseId || null}
                invoiceRate={invoiceRate}
                invoiceSym={invoiceSym}
            />
        </div>
    );
}
