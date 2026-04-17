import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtDateShort } from "../../helpers";

const LIMIT = 50;

export function useTransacciones({ notify }) {
    const [sales, setSales] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [histDateFrom, setHistDateFrom] = useState("");
    const [histDateTo, setHistDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeSeries, setActiveSeries] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [saleDetail, setSaleDetail] = useState(null);
    const [returnSale, setReturnSale] = useState(null);
    const [cancelConfirm, setCancelConfirm] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { setPage(1); }, [debouncedSearch, histDateFrom, histDateTo, activeFilters, activeSeries]);

    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (histDateFrom)         params.date_from = histDateFrom;
            if (histDateTo)           params.date_to   = histDateTo;
            if (debouncedSearch)      params.search    = debouncedSearch;
            if (activeFilters.length) params.status    = activeFilters[0];
            if (activeSeries.length)  params.serie_id  = activeSeries[0];
            const r = await api.sales.getAll(params);
            setSales(r.data);
            setTotal(r.total || 0);
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [histDateFrom, histDateTo, debouncedSearch, activeFilters, activeSeries, page, notify]);

    useEffect(() => { loadSales(); }, [loadSales]);

    const toggleFilter = (id) => setActiveFilters(p => p.includes(id) ? [] : [id]);
    const toggleSerie  = (id) => setActiveSeries(p => p.includes(id) ? [] : [id]);

    const clearFilters = () => {
        setActiveFilters([]);
        setActiveSeries([]);
        setHistDateFrom("");
        setHistDateTo("");
        setSearchTerm("");
        setShowFilterDrop(false);
    };

    const cancelSale = async (id) => {
        try { await api.sales.cancel(id); notify("Venta anulada"); loadSales(); }
        catch (e) { notify(e.message, "err"); }
    };

    const handleExportCSV = () => {
        const headers = ['Factura', 'Fecha', 'Cliente', 'RIF', 'Estado', 'Serie', 'Total', 'Abonado', 'Pendiente'];
        const rows = sales.map(s => [
            s.invoice_number || s.id, fmtDateShort(s.created_at),
            s.customer_name || 'Sin Cliente', s.customer_rif || '',
            s.status, s.serie_name || '', s.total, s.amount_paid, s.balance,
        ]);
        exportToCSV('Historial_Ventas', rows, headers);
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilters = activeFilters.length > 0 || activeSeries.length > 0 || !!histDateFrom || !!histDateTo;

    return {
        sales, total, page, setPage, loading, LIMIT,
        histDateFrom, setHistDateFrom,
        histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeSeries,
        showFilterDrop, setShowFilterDrop,
        saleDetail, setSaleDetail,
        returnSale, setReturnSale,
        cancelConfirm, setCancelConfirm,
        toggleFilter, toggleSerie, clearFilters,
        cancelSale, loadSales, handleExportCSV,
        hasFilters, totalPages,
    };
}
