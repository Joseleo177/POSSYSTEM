import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

/**
 * Resultado de un Reporte X o Z.
 *
 * - Modo real: la máquina confirmó y el reporte salió en papel. El agente todavía no lee sus
 *   cifras de la máquina, así que aquí no se muestra ninguna: mejor nada que un número inventado.
 * - Modo prueba: cifras que el agente acumuló con facturas de prueba, marcadas como tales.
 */
export default function FiscalReportModal({ open, onClose, reportData }) {
  if (!open || !reportData) return null;

  const esZ = reportData.tipo === "REPORTE_Z";
  const esPrueba = reportData.modo !== "REAL_FISCAL";
  const nombre = esZ ? "Reporte Z (cierre del día)" : "Reporte X (lectura parcial)";
  const d = esPrueba ? reportData.datos : null;

  const fmtBs = (n) =>
    Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const Fila = ({ label, valor, fuerte }) => (
    <div className={`flex justify-between gap-3 ${fuerte ? "font-bold text-[13px]" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={esPrueba ? `${nombre} · prueba` : nombre} width={420}>
      <div className="space-y-4">
        {esPrueba ? (
          <p className="rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] leading-snug">
            <span className="font-semibold uppercase tracking-wide block mb-0.5">Prueba · sin valor fiscal</span>
            El agente está en modo prueba: no se envió nada a la máquina. Las cifras son de las facturas
            de prueba desde que arrancó el agente{esZ ? ", y quedan en cero" : ""}.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-success/10 text-success px-3 py-2.5 text-[13px] leading-snug">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>
              {reportData.mensaje || `${nombre} impreso en la máquina fiscal.`}
              <span className="block text-[12px] text-content-subtle mt-1">
                Las cifras están en el papel; NXUS todavía no las lee de la máquina.
              </span>
            </span>
          </p>
        )}

        {(reportData.fecha || reportData.hora) && (
          <p className="text-[12px] text-content-subtle">
            {[reportData.fecha, reportData.hora].filter(Boolean).join(" · ")}
            {reportData.numeroPrueba ? ` · ${reportData.numeroPrueba}` : ""}
          </p>
        )}

        {d && (
          <div className="rounded-lg border border-border dark:border-white/10 p-4 space-y-1 text-[12px] text-content dark:text-white">
            <Fila label="Facturas de prueba" valor={d.facturasEmitidas} />
            {d.ultimaFactura && <Fila label="Última" valor={d.ultimaFactura} />}
            <div className="border-t border-dashed border-border dark:border-white/10 my-2" />
            <Fila label="Exento" valor={`Bs. ${fmtBs(d.totalExento)}`} />
            <Fila label="Base imponible G (16%)" valor={`Bs. ${fmtBs(d.baseGeneral)}`} />
            <Fila label="IVA G (16%)" valor={`Bs. ${fmtBs(d.ivaGeneral)}`} />
            {d.baseReducido > 0 && (
              <>
                <Fila label="Base imponible R (8%)" valor={`Bs. ${fmtBs(d.baseReducido)}`} />
                <Fila label="IVA R (8%)" valor={`Bs. ${fmtBs(d.ivaReducido)}`} />
              </>
            )}
            <div className="border-t border-dashed border-border dark:border-white/10 my-2" />
            <Fila label="Total" valor={`Bs. ${fmtBs(d.totalVentas)}`} fuerte />
            {d.pagos && Object.entries({
              efectivo: "Efectivo",
              debito: "Tarjeta de débito",
              credito: "Tarjeta de crédito",
              transferencia: "Transferencia / pago móvil",
            }).filter(([k]) => d.pagos[k] > 0).map(([k, label]) => (
              <Fila key={k} label={label} valor={`Bs. ${fmtBs(d.pagos[k])}`} />
            ))}
          </div>
        )}

        <Button variant="primary" className="w-full h-10 font-bold" onClick={onClose}>
          Aceptar
        </Button>
      </div>
    </Modal>
  );
}
