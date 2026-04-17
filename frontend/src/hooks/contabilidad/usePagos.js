import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";

const LIMIT = 50;

export function usePagos({ notify }) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const [viewType, setViewType] = useState("historial");
    const [searchTerm, setSearchTerm] = useState("");
    const [payDateFrom, setPayDateFrom] = useState("");
    const [payDateTo, setPayDateTo] = useState("");
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    const [payDetail, setPayDetail] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);

    // Query unificado — cualquier cambio recarga desde página 1
    const [query, setQuery] = useState({ viewType: "historial", search: "", dateFrom: "", dateTo: "", page: 1, refresh: 0 });

    useEffect(() => {
        const timer = setTimeout(() => setQuery(q => ({ ...q, search: searchTerm, page: 1 })), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setQuery(q => ({ ...q, viewType, dateFrom: payDateFrom, dateTo: payDateTo, page: 1 }));
    }, [viewType, payDateFrom, payDateTo]); // eslint-disable-line

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const params = { limit: LIMIT, offset: (query.page - 1) * LIMIT };
                if (query.search)   params.search    = query.search;
                if (query.dateFrom) params.date_from = query.dateFrom;
                if (query.dateTo)   params.date_to   = query.dateTo;
                const res = query.viewType === "pendientes"
                    ? await api.payments.getPending(params)
                    : await api.payments.getAll(params);
                if (!cancelled) { setData(res.data || []); setTotal(res.total || 0); }
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
        setShowFilterDrop(false);
    };

    const confirmRemovePayment = async () => {
        if (!deleteDialog) return;
        try {
            await api.payments.remove(deleteDialog);
            notify("Pago eliminado");
            reload();
            setDeleteDialog(null);
        } catch (e) { notify(e.message, "err"); }
    };

    const handleExportCSV = () => {
        const headers = ["Referencia", "Estado", "Cliente", "Fecha", "Monto"];
        const rows = data.map(item => {
            const isInvoice = viewType === "pendientes";
            return [
                item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`),
                isInvoice ? (item.status === "parcial" ? "Parcial" : "Pendiente") : "Cobro Realizado",
                item.customer_name || "Consumidor Final",
                new Date(item.created_at).toLocaleDateString(),
                isInvoice ? item.total : item.amount,
            ];
        });
        exportToCSV("Cobros_Pagos", rows, headers);
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilters = !!(payDateFrom || payDateTo || viewType !== "historial");

    return {
        data, total, page, setPage, loading, LIMIT,
        viewType, setViewType,
        searchTerm, setSearchTerm,
        payDateFrom, setPayDateFrom,
        payDateTo, setPayDateTo,
        showFilterDrop, setShowFilterDrop,
        payDetail, setPayDetail,
        payModal, setPayModal,
        deleteDialog, setDeleteDialog,
        clearFilters, reload,
        confirmRemovePayment, handleExportCSV,
        hasFilters, totalPages,
    };
}
