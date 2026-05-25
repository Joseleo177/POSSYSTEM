import { useState } from "react";
import JournalSummary from "./JournalSummary";
import JournalMovementsModal from "./JournalMovementsModal";
import DateRangePicker from "../ui/DateRangePicker";

export default function EstadoCuentaTab() {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo]     = useState("");
    const [selectedJournal, setSelectedJournal] = useState(null);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Subheader con filtro de fecha */}
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-60">
                    Filtrar por período
                </div>
                <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />
                {(dateFrom || dateTo) && (
                    <button
                        onClick={() => { setDateFrom(""); setDateTo(""); }}
                        className="text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 px-2 py-1 rounded-lg transition-colors"
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {/* Cards de diarios */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                <JournalSummary
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onSelectJournal={setSelectedJournal}
                />
            </div>

            {/* Modal de movimientos */}
            {selectedJournal && (
                <JournalMovementsModal
                    journalId={selectedJournal.id}
                    onClose={() => setSelectedJournal(null)}
                />
            )}
        </div>
    );
}
