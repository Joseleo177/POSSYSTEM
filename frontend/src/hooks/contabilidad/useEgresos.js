import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtDateShort } from "../../helpers";

const LIMIT = 50;

export function useEgresos({ notify, journals }) {
    const [expenses, setExpenses] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [categories, setCategories] = useState([]);
    const [histDateFrom, setHistDateFrom] = useState("");
    const [histDateTo, setHistDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeCats, setActiveCats] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [voidConfirm, setVoidConfirm] = useState(null);

    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "" });
    const [saving, setSaving] = useState(false);

    const selectedJournal = form.payment_journal_id ? journals?.find(j => j.id == form.payment_journal_id) : null;
    const currentRate = selectedJournal?.exchange_rate || 1;
    const currentSymbol = selectedJournal?.currency_symbol || "$";

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { setPage(1); }, [debouncedSearch, histDateFrom, histDateTo, activeFilters, activeCats]);

    useEffect(() => {
        api.expenses.getCategories().then(r => setCategories(r.data || [])).catch(() => {});
    }, []);

    const loadExpenses = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (histDateFrom)          params.date_from    = histDateFrom;
            if (histDateTo)            params.date_to      = histDateTo;
            if (debouncedSearch)       params.search       = debouncedSearch;
            if (activeFilters.length)  params.status       = activeFilters[0];
            if (activeCats.length)     params.category_id  = activeCats[0];
            const r = await api.expenses.getAll(params);
            setExpenses(r.data);
            setTotal(r.total || 0);
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [histDateFrom, histDateTo, debouncedSearch, activeFilters, activeCats, page, notify]);

    useEffect(() => { loadExpenses(); }, [loadExpenses]);

    const toggleFilter = (id) => setActiveFilters(p => p.includes(id) ? [] : [id]);
    const toggleCat    = (id) => setActiveCats(p => p.includes(id) ? [] : [id]);

    const clearFilters = () => {
        setActiveFilters([]);
        setActiveCats([]);
        setHistDateFrom("");
        setHistDateTo("");
        setSearchTerm("");
        setShowFilterDrop(false);
    };

    const handleVoid = async (id) => {
        try { await api.expenses.void(id); notify("Egreso anulado"); loadExpenses(); }
        catch (e) { notify(e.message, "err"); }
    };

    const handleCreate = async () => {
        if (!form.description || !form.amount || !form.category_id)
            return notify("Descripción, monto y categoría son obligatorios", "err");
        setSaving(true);
        try {
            const inputAmount = parseFloat(form.amount);
            const baseAmount = currentRate !== 1 ? inputAmount / currentRate : inputAmount;
            await api.expenses.create({
                description: form.description,
                amount: baseAmount,
                category_id: parseInt(form.category_id),
                payment_journal_id: form.payment_journal_id ? parseInt(form.payment_journal_id) : null,
                reference: form.reference || null,
                notes: form.notes || null,
                currency_id: selectedJournal?.currency_id || null,
                rate: currentRate,
            });
            notify("Egreso registrado correctamente");
            setShowCreate(false);
            setForm({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "" });
            loadExpenses();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    const handleExportCSV = () => {
        const headers = ['Referencia', 'Fecha', 'Descripción', 'Categoría', 'Diario', 'Estado', 'Monto'];
        const rows = expenses.map(e => [
            e.reference || '-', fmtDateShort(e.created_at),
            e.description, e.category_name, e.journal_name || '-',
            e.status, e.amount,
        ]);
        exportToCSV('Historial_Egresos', rows, headers);
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilters = activeFilters.length > 0 || activeCats.length > 0 || !!histDateFrom || !!histDateTo;

    return {
        expenses, total, page, setPage, loading, LIMIT,
        categories,
        histDateFrom, setHistDateFrom,
        histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeCats,
        showFilterDrop, setShowFilterDrop,
        voidConfirm, setVoidConfirm,
        showCreate, setShowCreate,
        form, setForm, saving,
        selectedJournal, currentRate, currentSymbol,
        toggleFilter, toggleCat, clearFilters,
        handleVoid, handleCreate, handleExportCSV,
        hasFilters, totalPages,
    };
}
