import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import Segmented from "../ui/Segmented";
import PaymentReportList from "../PaymentReports/PaymentReportList";

// Contabilidad → Pagos reportados: lo que los clientes dicen haber pagado desde el catálogo.
// Lo que ya está en un extracto subido se confirma solo; aquí se revisa el resto contra el
// banco. Confirmado, la caja lo registra al cobrar el pedido.
const FILTROS = [
    { key: "pendiente", label: "Por confirmar" },
    { key: "confirmado", label: "Confirmados" },
    { key: "aplicado", label: "Cobrados" },
    { key: "rechazado", label: "Rechazados" },
];

export default function PagosReportadosTab({ notify }) {
    const [filtro, setFiltro] = useState("pendiente");
    const [rows, setRows] = useState(null);

    const load = useCallback(async () => {
        try {
            const r = await api.paymentReports.list({ status: filtro });
            setRows(r.data || []);
        } catch (e) {
            notify(e.message, "err");
            setRows([]);
        }
    }, [filtro, notify]);
    useEffect(() => { setRows(null); load(); }, [load]);

    return (
        <div className="h-full overflow-y-auto lg:overflow-hidden flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                <div className="overflow-x-auto -mx-1 px-1">
                    <Segmented options={FILTROS} value={filtro} onChange={setFiltro} />
                </div>
                <p className="text-[12px] text-content-subtle">
                    Se confirman solos al subir el extracto si casan la referencia y el monto.
                </p>
            </div>

            <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                {rows === null ? (
                    <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="px-4 py-4 space-y-2">
                                <div className="h-3 w-1/3 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                <div className="h-3 w-2/3 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-14 text-center px-4">
                        <div className="w-11 h-11 mx-auto rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>
                        </div>
                        <p className="mt-3 text-[14px] font-medium text-content dark:text-white">
                            {filtro === "pendiente" ? "Nada por confirmar" : "Sin pagos en esta lista"}
                        </p>
                        <p className="text-[12px] text-content-subtle mt-0.5">
                            {filtro === "pendiente"
                                ? "Los pagos que reporten tus clientes desde el catálogo aparecen aquí."
                                : "Cambia el filtro para ver otros pagos."}
                        </p>
                    </div>
                ) : (
                    <PaymentReportList reports={rows} onChanged={load} showOrder />
                )}
            </div>
        </div>
    );
}
