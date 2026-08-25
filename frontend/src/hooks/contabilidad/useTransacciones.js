import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";

const LIMIT = 50;

export function useTransacciones({ notify }) {
    const [sales, setSales] = useState([]);
    const [total, setTotal] = useState(0);
    // Totales del filtro completo (moneda base), calculados en el servidor: sumar solo la
    // página visible daría una cifra que no corresponde a lo filtrado.
    const [sumTotal, setSumTotal] = useState(0);
    const [sumPaid, setSumPaid]   = useState(0);
    const [sumPending, setSumPending] = useState(0);
    // Lo perdonado en el filtro. Va aparte de "cobrado": es plata que se dejó de cobrar y,
    // como la exoneración no genera egreso, este pie es donde se ve totalizada.
    const [sumForgiven, setSumForgiven] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [histDateFrom, setHistDateFrom] = useState("");
    const [histDateTo, setHistDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeSeries, setActiveSeries] = useState([]);
    // Filtro por quién hizo la venta. "" = todos.
    const [employeeId, setEmployeeId] = useState("");
    const [employees, setEmployees] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [saleDetail, setSaleDetail] = useState(null);
    const [returnSale, setReturnSale] = useState(null);
    const [cancelConfirm, setCancelConfirm] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { setPage(1); }, [debouncedSearch, histDateFrom, histDateTo, activeFilters, activeSeries, employeeId]);

    // La lista para el desplegable. Si el empleado no tiene permiso para verla (employees.view)
    // se queda vacía y el filtro simplemente no se ofrece, en vez de saltar un error al abrir
    // la pestaña. Se incluyen los inactivos: sus ventas siguen en el histórico.
    useEffect(() => {
        let vivo = true;
        api.employees.getAll()
            .then(r => { if (vivo) setEmployees(r.data || []); })
            .catch(() => { /* sin permiso: sin filtro */ });
        return () => { vivo = false; };
    }, []);

    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (histDateFrom)         params.date_from = histDateFrom;
            if (histDateTo)           params.date_to   = histDateTo;
            if (debouncedSearch)      params.search    = debouncedSearch;
            if (activeFilters.length) params.status    = activeFilters[0];
            if (activeSeries.length)  params.serie_id  = activeSeries[0];
            if (employeeId)           params.employee_id = employeeId;
            const r = await api.sales.getAll(params);
            setSales(r.data);
            setTotal(r.total || 0);
            setSumTotal(parseFloat(r.sum_total || 0));
            setSumPaid(parseFloat(r.sum_paid || 0));
            setSumPending(parseFloat(r.sum_pending || 0));
            setSumForgiven(parseFloat(r.sum_forgiven || 0));
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [histDateFrom, histDateTo, debouncedSearch, activeFilters, activeSeries, employeeId, page, notify]);

    useEffect(() => { loadSales(); }, [loadSales]);

    const toggleFilter = (id) => setActiveFilters(p => p.includes(id) ? [] : [id]);
    const toggleSerie  = (id) => setActiveSeries(p => p.includes(id) ? [] : [id]);

    const clearFilters = () => {
        setActiveFilters([]);
        setActiveSeries([]);
        setEmployeeId("");
        setHistDateFrom("");
        setHistDateTo("");
        setSearchTerm("");
        setShowFilterDrop(false);
    };

    const cancelSale = async (id) => {
        try { await api.sales.cancel(id); notify("Venta anulada"); loadSales(); }
        catch (e) { notify(e.message, "err"); }
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilters = activeFilters.length > 0 || activeSeries.length > 0 || !!employeeId || !!histDateFrom || !!histDateTo;

    return {
        sales, total, sumTotal, sumPaid, sumPending, sumForgiven, page, setPage, loading, LIMIT,
        histDateFrom, setHistDateFrom,
        histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeSeries,
        employeeId, setEmployeeId, employees,
        showFilterDrop, setShowFilterDrop,
        saleDetail, setSaleDetail,
        returnSale, setReturnSale,
        cancelConfirm, setCancelConfirm,
        toggleFilter, toggleSerie, clearFilters,
        cancelSale, loadSales,
        hasFilters, totalPages,
    };
}
