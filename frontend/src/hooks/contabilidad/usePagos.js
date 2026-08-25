import { useState, useEffect } from "react";
import { api } from "../../services/api";

const LIMIT = 50;

export function usePagos({ notify }) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    // Suma del filtro completo en moneda base, calculada en el servidor: con 50 registros por
    // página, totalizar solo lo visible daría una cifra que no corresponde a lo filtrado.
    const [sumBase, setSumBase] = useState(0);
    // Moneda real de los cobros. Solo es sumable si todo el filtro comparte moneda.
    const [sumLocal, setSumLocal] = useState(0);
    const [currencyCount, setCurrencyCount] = useState(0);
    const [currencyId, setCurrencyId] = useState(null);
    const [loading, setLoading] = useState(true);

    const [viewType, setViewType] = useState("historial");
    const [searchTerm, setSearchTerm] = useState("");
    const [payDateFrom, setPayDateFrom] = useState("");
    const [payDateTo, setPayDateTo] = useState("");
    const [journalFilter, setJournalFilter] = useState("");
    // Quién cobró. "" = todos. La lista se pide una vez; si el usuario no tiene permiso para
    // ver empleados llega vacía y el filtro no se ofrece, en vez de reventar la pestaña.
    const [employeeFilter, setEmployeeFilter] = useState("");
    const [employees, setEmployees] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    useEffect(() => {
        let vivo = true;
        api.employees.getAll()
            .then(r => { if (vivo) setEmployees(r.data || []); })
            .catch(() => { /* sin permiso: sin filtro */ });
        return () => { vivo = false; };
    }, []);

    const [payDetail, setPayDetail] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);

    // Query unificado — cualquier cambio recarga desde página 1
    const [query, setQuery] = useState({ viewType: "historial", search: "", dateFrom: "", dateTo: "", journalId: "", employeeId: "", page: 1, refresh: 0 });

    useEffect(() => {
        const timer = setTimeout(() => setQuery(q => {
            if (q.search === searchTerm) return q;
            return { ...q, search: searchTerm, page: 1 };
        }), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setQuery(q => {
            if (q.viewType === viewType && q.dateFrom === payDateFrom && q.dateTo === payDateTo && q.journalId === journalFilter && q.employeeId === employeeFilter) return q;
            return { ...q, viewType, dateFrom: payDateFrom, dateTo: payDateTo, journalId: journalFilter, employeeId: employeeFilter, page: 1 };
        });
    }, [viewType, payDateFrom, payDateTo, journalFilter, employeeFilter]); // eslint-disable-line

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const params = { limit: LIMIT, offset: (query.page - 1) * LIMIT };
                if (query.search)   params.search    = query.search;
                if (query.dateFrom) params.date_from = query.dateFrom;
                if (query.dateTo)   params.date_to   = query.dateTo;
                if (query.journalId) params.payment_journal_id = query.journalId;
                if (query.employeeId) params.employee_id = query.employeeId;
                const res = query.viewType === "pendientes"
                    ? await api.payments.getPending(params)
                    : await api.payments.getAll(params);
                if (!cancelled) { setData(res.data || []); setTotal(res.total || 0); setSumBase(parseFloat(res.sum_base || 0)); setSumLocal(parseFloat(res.sum_local || 0)); setCurrencyCount(parseInt(res.currency_count || 0, 10)); setCurrencyId(res.currency_id ?? null); }
            } catch (e) {
                if (!cancelled) notify(e.message, "err");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [query]); // eslint-disable-line

    const page = query.page;
    const setPage = (p) => setQuery(q => ({ ...q, page: typeof p === "function" ? p(q.page) : p }));
    const reload = () => setQuery(q => ({ ...q, refresh: q.refresh + 1 }));

    const clearFilters = () => {
        setViewType("historial");
        setPayDateFrom("");
        setPayDateTo("");
        setJournalFilter("");
        setEmployeeFilter("");
        setShowFilterDrop(false);
    };

    const confirmRemovePayment = async () => {
        if (!deleteDialog) return;
        // La fila puede ser un cobro suelto o un cobro conjunto. El conjunto se deshace
        // entero: borrar una de sus partes dejaría facturas saldadas por un pago inexistente
        // y la caja con un ingreso a medias.
        const objetivo = typeof deleteDialog === "object" ? deleteDialog : { id: deleteDialog };
        try {
            if (objetivo.batch_id && objetivo.group_count > 1) {
                const r = await api.payments.removeBatch(objetivo.batch_id);
                notify(r.message || "Cobro eliminado");
            } else {
                await api.payments.remove(objetivo.id);
                notify("Pago eliminado");
            }
            reload();
            setDeleteDialog(null);
        } catch (e) { notify(e.message, "err"); }
    };

    const totalPages = Math.ceil(total / LIMIT);
    const filterCount = (viewType !== "historial" ? 1 : 0) + (payDateFrom || payDateTo ? 1 : 0) + (journalFilter ? 1 : 0) + (employeeFilter ? 1 : 0);
    const hasFilters = filterCount > 0;

    return {
        data, total, sumBase, sumLocal, currencyCount, currencyId, page, setPage, loading, LIMIT,
        viewType, setViewType,
        searchTerm, setSearchTerm,
        payDateFrom, setPayDateFrom,
        payDateTo, setPayDateTo,
        journalFilter, setJournalFilter,
        employeeFilter, setEmployeeFilter, employees,
        showFilterDrop, setShowFilterDrop,
        payDetail, setPayDetail,
        payModal, setPayModal,
        deleteDialog, setDeleteDialog,
        clearFilters, reload,
        confirmRemovePayment,
        hasFilters, filterCount, totalPages,
    };
}
