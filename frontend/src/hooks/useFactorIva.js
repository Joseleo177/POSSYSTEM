import { useCallback } from "react";
import { useApp } from "../context/AppContext";
import { factorPrecio } from "../helpers/iva";

// IVA que lleva encima el precio de venta de un producto o de una línea de compra (ver
// factorPrecio en helpers/iva.js): 1,16 en una empresa con IVA, 1 sin IVA o si es exento.
// Acepta el producto, o la línea con su alícuota plana (detalle de compra) o dentro de .product.
export function useFactorIva() {
    const { company } = useApp();
    const conIva = !!company?.iva_enabled;
    return useCallback((x) => factorPrecio(x?.iva_tipo ?? x?.product?.iva_tipo ?? "G", conIva), [conIva]);
}
