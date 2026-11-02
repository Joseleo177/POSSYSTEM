import { useState } from "react";
import JournalSummary from "./JournalSummary";
import JournalMovementsModal from "./JournalMovementsModal";
import DateRangePicker from "../ui/DateRangePicker";
import SucursalFilter, { useSucursalFilter } from "../ui/SucursalFilter";

export default function EstadoCuentaTab() {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo]     = useState("");
    const [selectedJournal, setSelectedJournal] = useState(null);

    // Casi nunca el mismo banco es la misma cuenta en dos sucursales: "Banco de Venezuela" en
    // la tienda A y en la B son dos cuentas reales distintas. Se elige entre las marcadas en la
    // barra de arriba; sin filtro, todas ellas.
    const suc = useSucursalFilter({ soloVenden: true });

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Subheader con filtros */}
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-3">
                <div className="text-[12px] text-content-subtle">
                    Filtrar por período
                </div>
                <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />
                {(dateFrom || dateTo) && (
                    <button
                        onClick={() => { setDateFrom(""); setDateTo(""); }}
                        className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-content-muted dark:text-white/60 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/5 transition-colors"
                    >
                        Limpiar
                    </button>
                )}
                <SucursalFilter filter={suc} boxClassName="h-9 min-w-[180px]" />
            </div>

            {/* Cards de diarios */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                <JournalSummary
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    warehouseId={suc.warehouseId}
                    onSelectJournal={setSelectedJournal}
                />
            </div>

            {/* Modal de movimientos */}
            {selectedJournal && (
                <JournalMovementsModal
                    journalId={selectedJournal.bank_id ? null : selectedJournal.id}
                    bankId={selectedJournal.bank_id ?? null}
                    warehouseId={selectedJournal.bank_id ? selectedJournal.warehouse_id : undefined}
                    onClose={() => setSelectedJournal(null)}
                />
            )}
        </div>
    );
}
