import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";

const LIMIT = 30;

export function useQuotations({ notify }) {
    const [quotations, setQuotations] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [searchTerm, setSearchTerm]   = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [dateFrom, setDateFrom]       = useState("");
    const [dateTo, setDateTo]           = useState("");

    const [expandedId, setExpandedId]   = useState(null);
    const [cancelConfirm, setCancelConfirm] = useState(null);
    const [convertModal, setConvertModal]   = useState(null);

    const hasFilters = !!(statusFilter || dateFrom || dateTo);

    const totalPages = Math.max(1, Math.ceil(total / LIMIT));

    const load = useCallback(async (p = page) => {
        setLoading(true);
        try {
            const params = { page: p, limit: LIMIT };
            if (searchTerm.trim()) params.search = searchTerm.trim();
            if (statusFilter)      params.status  = statusFilter;
            if (dateFrom)          params.date_from = dateFrom;
            if (dateTo)            params.date_to   = dateTo;

            const res = await api.quotations.getAll(params);
            setQuotations(res.data || []);
            setTotal(res.total || 0);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm, statusFilter, dateFrom, dateTo, notify]);

    useEffect(() => { load(page); }, [load, page]);

    useEffect(() => { setPage(1); load(1); }, [searchTerm, statusFilter, dateFrom, dateTo]);

    const cancelQuotation = useCallback(async (id) => {
        try {
            await api.quotations.cancel(id);
            notify("Cotización anulada");
            load(page);
        } catch (e) {
            notify(e.message, "err");
        }
    }, [load, page, notify]);

    const convertQuotation = useCallback(async (id, serieId) => {
        try {
            const res = await api.quotations.convert(id, { serie_id: serieId });
            notify(`Cotización convertida · Factura ${res.data.invoice_number}`);
            setConvertModal(null);
            load(page);
        } catch (e) {
            notify(e.message, "err");
        }
    }, [load, page, notify]);

    const clearFilters = () => {
        setStatusFilter("");
        setDateFrom("");
        setDateTo("");
        setPage(1);
    };

    return {
        quotations, total, page, setPage, loading, LIMIT, totalPages,
        searchTerm, setSearchTerm,
        statusFilter, setStatusFilter,
        dateFrom, setDateFrom,
        dateTo, setDateTo,
        hasFilters, clearFilters,
        expandedId, setExpandedId,
        cancelConfirm, setCancelConfirm,
        convertModal, setConvertModal,
        cancelQuotation, convertQuotation,
        load,
    };
}
