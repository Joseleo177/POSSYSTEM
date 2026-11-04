import { fmtDateShort } from "../../helpers/dates";

/**
 * Debajo de la fecha del pago: con una fecha anterior, a qué tasa va el cobro (ver
 * hooks/useRatesOn). Si no hay tasa guardada para ese día, o no se pudo consultar, lo dice: el
 * cobro sigue con la de hoy y el cajero puede escribirla a mano.
 */
export default function AvisoTasaFecha({ estado, fecha }) {
  if (!estado || estado.status === "hoy") return null;
  const dia = fmtDateShort(fecha);
  if (estado.status === "cargando") {
    return <p className="mt-1 text-[12px] text-content-subtle">Buscando la tasa del {dia}…</p>;
  }
  if (estado.status === "listo") {
    return <p className="mt-1 text-[12px] text-content-subtle">Pago de otro día: se cobra a la tasa que regía el {dia}.</p>;
  }
  return (
    <p className="mt-1 text-[12px] text-warning">
      {estado.status === "error"
        ? `No se pudo consultar la tasa del ${dia}: se usa la de hoy.`
        : `No hay tasa guardada para el ${dia}: se usa la de hoy.`}
    </p>
  );
}
