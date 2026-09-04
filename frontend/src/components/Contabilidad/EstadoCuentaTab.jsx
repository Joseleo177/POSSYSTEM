import { useState, useEffect } from "react";
import { api } from "../../services/api";
import JournalSummary from "./JournalSummary";
import JournalMovementsModal from "./JournalMovementsModal";
import DateRangePicker from "../ui/DateRangePicker";
import CustomSelect from "../ui/CustomSelect";

export default function EstadoCuentaTab() {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo]     = useState("");
    const [selectedJournal, setSelectedJournal] = useState(null);

    // Casi nunca el mismo banco es la misma cuenta en dos sucursales: "Banco de Venezuela" en
    // la tienda A y en la B son dos cuentas reales distintas. Sin poder aislar una sola, el
    // consolidado de "todas" era el único estado de cuenta disponible.
    const [warehouseId, setWarehouseId] = useState("");
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        api.warehouses.getAll()
            // Un depósito no factura ni tiene diario de caja: no hay estado de cuenta que
            // mostrar ahí. Mismo filtro que ya usa el resto de selectores de sucursal.
            .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
            .catch(e => console.error("[EstadoCuentaTab] no se pudieron cargar los almacenes:", e));
    }, []);
    // Con una sola sucursal, "todas" promete un alcance que no existe. Mismo criterio que
    // Márgenes e Inventario.
    const todasLabel = warehouses.length === 1 ? warehouses[0].name : "TODAS LAS SUCURSALES";

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Subheader con filtros */}
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
                {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo
                    insinuaría que hay más, cuando no las hay. */}
                {warehouses.length > 1 && (
                <CustomSelect
                    value={warehouseId}
                    onChange={setWarehouseId}
                    placeholder={todasLabel}
                    boxClassName="h-9 min-w-[190px]"
                    options={[
                        { value: "", label: todasLabel },
                        ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
                    ]}
                />
                )}
            </div>

            {/* Cards de diarios */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                <JournalSummary
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    warehouseId={warehouseId}
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
