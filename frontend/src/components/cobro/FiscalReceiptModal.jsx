import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { useApp } from "../../context/AppContext";

/**
 * Resumen en pantalla de la factura enviada a la máquina fiscal. NO es el comprobante: el
 * documento legal es el que imprime la máquina (con su encabezado SENIAT, serial, MH y código).
 * Por eso aquí no se dibuja nada de eso ni se inventa ningún dato: lo que no se sabe no se
 * muestra. Las cifras las calcula NXUS desde la venta.
 *
 * fiscalData.modo: 'REAL_FISCAL' (la máquina confirmó) o 'PRUEBA' (agente en modo prueba).
 * fiscalData.aviso: lo que el cajero tiene que saber (número sin leer, no guardado, prueba).
 */
export default function FiscalReceiptModal({
  open,
  onClose,
  fiscalData,
  sale,
  company,
  companyInfo,
  settings,
  rateBs = 1,
  totalBs = null
}) {
  const appContext = useApp?.() || {};
  if (!open || !fiscalData) return null;

  const esPrueba = fiscalData.modo !== "REAL_FISCAL";
  const numero = esPrueba ? fiscalData.numeroPrueba : fiscalData.numeroFacturaFiscal;
  const items = sale?.items || [];

  const hoy = new Date();
  const fecha = hoy.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const hora = hoy.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

  const fmtBs = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const actualSettings = settings || appContext.settings || {};
  const actualCompanyInfo = companyInfo || appContext.companyInfo || {};
  const actualCompany = company || appContext.company || {};

  // Datos de la empresa emisora tal como están configurados; si falta alguno, no se muestra.
  const empNombre = actualSettings.store_name || actualCompanyInfo.name || actualCompanyInfo.store_name || actualCompany.name || "";
  const empRif = actualSettings.store_rif || actualCompanyInfo.rif || actualCompanyInfo.store_rif || actualCompany.tax_id || "";
  const empDir = [
    actualSettings.store_address || actualCompanyInfo.address,
    actualSettings.store_city || actualCompanyInfo.city
  ].filter(Boolean).join(", ") || actualCompany.address || "";
  const empTlf = actualSettings.store_phone || actualCompanyInfo.phone || actualCompany.phone || "";

  const clienteNombre = sale?.customer_name || sale?.customerName || "";
  const clienteRif = sale?.customer_rif || sale?.customerRif || "";
  const ordenNum = sale?.invoice_number || (sale?.id ? `#${sale.id}` : "");

  const rate = parseFloat(rateBs) > 1
    ? parseFloat(rateBs)
    : (parseFloat(sale?.exchange_rate) > 1 ? parseFloat(sale.exchange_rate) : 1);
  const total = totalBs ? parseFloat(totalBs) : Math.round(parseFloat(sale?.total || 0) * rate * 100) / 100;

  let totalExentoBs = 0;
  let totalBaseGeneralBs = 0;
  let totalIvaGeneralBs = 0;
  let totalBaseReducidoBs = 0;
  let totalIvaReducidoBs = 0;

  const itemsProcesados = items.map((it) => {
    const cant = parseFloat(it.quantity || 1);
    const precioUnitario = Math.round(parseFloat(it.price || it.unit_price || 0) * rate * 100) / 100;
    const subtotalLinea = Math.round(cant * precioUnitario * 100) / 100;

    let tasaItem = 16;
    if (it.iva_rate !== undefined && it.iva_rate !== null && it.iva_rate !== "") {
      tasaItem = parseFloat(it.iva_rate);
    } else if (it.tax_rate !== undefined && it.tax_rate !== null && it.tax_rate !== "") {
      tasaItem = parseFloat(it.tax_rate);
    } else if (it.iva_tipo === "E" || it.is_exempt) {
      tasaItem = 0;
    } else if (it.iva_tipo === "R") {
      tasaItem = 8;
    } else if (it.iva_tipo === "A") {
      tasaItem = 31;
    }

    let taxTag = "(G)";
    let subtotalLineaVisual = subtotalLinea;
    if (tasaItem === 0) {
      taxTag = "(E)";
      totalExentoBs += subtotalLinea;
    } else if (tasaItem === 8) {
      taxTag = "(R)";
      const b = Math.round((subtotalLinea / 1.08) * 100) / 100;
      totalBaseReducidoBs += b;
      totalIvaReducidoBs += Math.round((subtotalLinea - b) * 100) / 100;
      subtotalLineaVisual = b;
    } else {
      const b = Math.round((subtotalLinea / 1.16) * 100) / 100;
      totalBaseGeneralBs += b;
      totalIvaGeneralBs += Math.round((subtotalLinea - b) * 100) / 100;
      subtotalLineaVisual = b;
    }

    return { ...it, cant, subtotalLinea: subtotalLineaVisual, taxTag };
  });

  return (
    <Modal open={open} onClose={onClose} title={esPrueba ? "Factura de prueba" : "Factura fiscal emitida"} width={420}>
      <div className="space-y-4">
        {esPrueba && (
          <p className="rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-center">
            Prueba · sin valor fiscal
          </p>
        )}
        {fiscalData.aviso && (
          <p role="alert" className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-snug ${esPrueba ? "bg-surface-2 text-content dark:bg-white/[0.06] dark:text-white" : "bg-danger/10 text-danger"}`}>
            <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {fiscalData.aviso}
          </p>
        )}

        <div className="bg-[#fbfbf9] text-zinc-900 p-6 rounded-md border border-zinc-300 font-mono text-[11px] leading-tight select-none">
          {/* Emisor */}
          {(empNombre || empRif || empDir || empTlf) && (
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-zinc-400">
              {empRif && <p className="font-bold text-[12px]">RIF {empRif}</p>}
              {empNombre && <p className="font-bold uppercase text-[11px] px-2">{empNombre}</p>}
              {empDir && <p className="text-[10px] text-zinc-600 uppercase">{empDir}</p>}
              {empTlf && <p className="text-[9px] text-zinc-500">{empTlf}</p>}
            </div>
          )}

          {/* Cliente */}
          {(clienteRif || clienteNombre || ordenNum) && (
            <div className="py-2 border-b border-dashed border-zinc-400 text-[10px] space-y-0.5 uppercase">
              {clienteRif && <p><span className="text-zinc-500">RIF/C.I.:</span> {clienteRif}</p>}
              {clienteNombre && <p><span className="text-zinc-500">RAZÓN SOCIAL:</span> {clienteNombre}</p>}
              {ordenNum && <p><span className="text-zinc-500">VENTA NXUS:</span> {ordenNum}</p>}
            </div>
          )}

          {/* Número y fecha */}
          <div className="flex justify-between py-1.5 font-bold text-[11px] border-b border-dashed border-zinc-400">
            <div>
              <p>{esPrueba ? "FACTURA DE PRUEBA" : "FACTURA"}</p>
              <p className="text-[10px] font-normal text-zinc-600">FECHA: {fecha}</p>
            </div>
            <div className="text-right">
              <p className="tracking-wider text-[12px]">{numero || "VER PAPEL"}</p>
              <p className="text-[10px] font-normal text-zinc-600">HORA: {hora}</p>
            </div>
          </div>

          {/* Renglones */}
          <div className="py-2 border-b border-dashed border-zinc-400 space-y-1">
            {itemsProcesados.map((it, idx) => (
              <div key={idx} className="flex justify-between items-baseline gap-2 text-[10px]">
                <span className="truncate">{it.cant}x {it.product_name || it.name || "Item"} {it.taxTag}</span>
                <span className="shrink-0 tabular-nums font-semibold">Bs. {fmtBs(it.subtotalLinea)}</span>
              </div>
            ))}
          </div>

          {/* Desglose */}
          <div className="py-2 border-b border-dashed border-zinc-400 space-y-1 text-[10px]">
            {totalExentoBs > 0 && (
              <div className="flex justify-between font-semibold">
                <span>EXENTO</span>
                <span className="tabular-nums">Bs. {fmtBs(totalExentoBs)}</span>
              </div>
            )}
            {totalBaseGeneralBs > 0 && (
              <>
                <div className="flex justify-between">
                  <span>BI G16,00%</span>
                  <span className="tabular-nums">Bs. {fmtBs(totalBaseGeneralBs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA G16,00%</span>
                  <span className="tabular-nums">Bs. {fmtBs(totalIvaGeneralBs)}</span>
                </div>
              </>
            )}
            {totalBaseReducidoBs > 0 && (
              <>
                <div className="flex justify-between">
                  <span>BI R8,00%</span>
                  <span className="tabular-nums">Bs. {fmtBs(totalBaseReducidoBs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA R8,00%</span>
                  <span className="tabular-nums">Bs. {fmtBs(totalIvaReducidoBs)}</span>
                </div>
              </>
            )}
          </div>

          {/* Total */}
          <div className="py-2 space-y-1">
            <div className="flex justify-between text-[13px] font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">Bs. {fmtBs(total)}</span>
            </div>
            <p className="text-[10px] text-zinc-500"># ITEMS: {items.length}</p>
          </div>

          <p className="pt-2 border-t border-dashed border-zinc-400 text-[9px] text-zinc-500 font-sans leading-snug text-center">
            {esPrueba
              ? "Generada por el agente en modo prueba. No se envió a la máquina fiscal."
              : "Resumen calculado por NXUS. El comprobante válido es el que imprimió la máquina fiscal."}
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose} className="w-full sm:w-auto">
            Aceptar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
