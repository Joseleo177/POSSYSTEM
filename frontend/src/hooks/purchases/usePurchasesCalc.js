import { useMemo } from "react";
import { calcPurchaseItem } from "../../helpers";
import { useFactorIva } from "../useFactorIva";

export function usePurchasesCalc({ itemForm, items }) {
    const factorIva = useFactorIva();
    // ───────────────────────────────────────────────
    // CÁLCULO DEL ITEM ACTUAL
    // ───────────────────────────────────────────────
    const calc = useMemo(() => {
        if (!itemForm.product) return null;
        return calcPurchaseItem(itemForm, factorIva(itemForm.product));
    }, [itemForm, factorIva]);

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
