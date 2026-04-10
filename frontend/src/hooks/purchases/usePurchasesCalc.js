import { useMemo } from "react";
import { calcPurchaseItem } from "../../helpers";

export function usePurchasesCalc({ itemForm, items }) {
    // ───────────────────────────────────────────────
    // CÁLCULO DEL ITEM ACTUAL
    // ───────────────────────────────────────────────
    const calc = useMemo(() => {
        if (!itemForm.product) return null;
        return calcPurchaseItem(itemForm);
    }, [itemForm]);

    // ───────────────────────────────────────────────
    // TOTAL GENERAL DE LA COMPRA
    // ───────────────────────────────────────────────
    const grandTotal = useMemo(() => {
        return items.reduce((acc, i) => acc + (i.subtotal || 0), 0);
    }, [items]);

    return {
        calc,
        grandTotal,
    };
}
