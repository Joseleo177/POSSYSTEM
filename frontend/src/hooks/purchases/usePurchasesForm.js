import { useCallback, useEffect, useState } from "react";
import { calcPurchaseItem } from "../../helpers";

export function usePurchasesForm({
    // estados del formulario
    itemForm,
    setItemForm,
    items,
    setItems,
    selectedSupplier,
    setSelectedSupplier,
    notes,
    setNotes,

    // utilidades
    notify,
}) {

    // ───────────────────────────────────────────────
    // CALCULOS EN TIEMPO REAL
    // ───────────────────────────────────────────────
    const [calc, setCalc] = useState({
        unit_cost: null,
        sale_price: null,
        total_units: null,
    });

    useEffect(() => {
        // Si no hay producto seleccionado, limpiar cálculos
        if (!itemForm.product) {
            setCalc({
                unit_cost: null,
                sale_price: null,
                total_units: null,
            });
            return;
        }

        // Calcular usando tu helper original
        const result = calcPurchaseItem(itemForm);

        setCalc({
            unit_cost: result.unit_cost,
            sale_price: result.sale_price,
            total_units: result.total_units,
        });

    }, [itemForm]);

    // ───────────────────────────────────────────────
    // SETEAR CAMPOS DEL ITEM
    // ───────────────────────────────────────────────
    const setIF = useCallback((key, val) => {
        setItemForm(prev => {
            const newState = { ...prev, [key]: val };

            // Si el usuario selecciona "unidad", el tamaño del paquete es 1
            if (key === "package_unit" && val.toLowerCase() === "unidad") {
                newState.package_size = "1";
            }

            return newState;
        });
    }, [setItemForm]);

    // ───────────────────────────────────────────────
    // SELECCIONAR PRODUCTO
    // ───────────────────────────────────────────────
    const selectProduct = useCallback(p => {
        setItemForm(prev => {
            const pkgUnit = p.package_unit || prev.package_unit || "unidad";

            return {
                ...prev,
                product: p,
                package_unit: pkgUnit,
                package_size:
                    pkgUnit.toLowerCase() === "unidad"
                        ? "1"
                        : p.package_size != null
                            ? String(p.package_size)
                            : prev.package_size,
                profit_margin:
                    p.profit_margin != null
                        ? String(p.profit_margin)
                        : prev.profit_margin,
            };
        });
    }, [setItemForm]);

    // ───────────────────────────────────────────────
    // AGREGAR ITEM
    // ───────────────────────────────────────────────
    const addItem = useCallback(() => {
        if (!itemForm.product)
            return notify("Selecciona un producto", "err");

        if (!itemForm.package_size)
            return notify("Indica unidades por paquete", "err");

        if (!itemForm.package_price)
            return notify("Indica precio por paquete", "err");

        if (!itemForm.package_qty || parseFloat(itemForm.package_qty) <= 0)
            return notify("Cantidad debe ser mayor a 0", "err");

        const calc = calcPurchaseItem(itemForm);

        setItems(prev => [
            ...prev,
            { ...itemForm, ...calc, key: Date.now() }
        ]);

        // Reiniciar formulario pero mantener margen de ganancia
        setItemForm(prev => ({
            ...itemForm,
            product: null,
            package_unit: "",
            package_size: "",
            package_qty: 1,
            package_price: "",
            lot_number: "",
            expiration_date: "",
            update_price: true,
            profit_margin: prev.profit_margin,
        }));
    }, [itemForm, notify, setItems, setItemForm]);

    // ───────────────────────────────────────────────
    // ELIMINAR ITEM
    // ───────────────────────────────────────────────
    const removeItem = useCallback(key => {
        setItems(prev => prev.filter(i => i.key !== key));
    }, [setItems]);

    // ───────────────────────────────────────────────
    // RESET COMPLETO DEL FORMULARIO
    // ───────────────────────────────────────────────
    const resetForm = useCallback(() => {
        setSelectedSupplier(null);
        setNotes("");
        setItems([]);
        setItemForm({
            product: null,
            package_unit: "",
            package_size: "",
            package_qty: 1,
            package_price: "",
            lot_number: "",
            expiration_date: "",
            profit_margin: 30,
            update_price: true,
        });
    }, [setSelectedSupplier, setNotes, setItems, setItemForm]);

    return {
        // estados
        itemForm,
        items,
        selectedSupplier,
        notes,
        calc,

        // setters
        setIF,
        selectProduct,
        addItem,
        removeItem,
        resetForm,
        setSelectedSupplier,
        setNotes,
    };
}
