import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { todayISO } from "../../helpers";
import { resolveRate } from "../../components/ui/RateField";

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
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const [showCreate, setShowCreate] = useState(false);
    const today = () => todayISO();
    const [form, setForm] = useState({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "", date: today(), rate: "", warehouse_id: "" });
    const [saving, setSaving] = useState(false);

    // Los egresos son de una sucursal. La API ya devuelve solo los almacenes del usuario,
    // así que si tiene uno solo se preselecciona y el campo queda de mero informativo.
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        api.warehouses.getAll()
            .then(r => {
                const list = r.data || [];
                setWarehouses(list);
                if (list.length === 1) setForm(p => p.warehouse_id ? p : { ...p, warehouse_id: String(list[0].id) });
            })
            .catch(() => {});
    }, []);

    const selectedJournal = form.payment_journal_id ? journals?.find(j => j.id == form.payment_journal_id) : null;
    // La tasa del día a la que realmente se paga no siempre es la cargada en configuración.
    // form.rate vale solo para este egreso; vacío = se usa la del diario.
    const configuredRate = parseFloat(selectedJournal?.exchange_rate) || 1;
    const currentRate = resolveRate(form.rate, configuredRate);
    const currentSymbol = selectedJournal?.currency_symbol || "Ref.";
    // El monto se teclea en la moneda del diario y se guarda en base: este es el equivalente
    // que quedará almacenado, visible antes de guardar para no registrar a ciegas.
    const baseEquivalent = (parseFloat(form.amount) || 0) / (currentRate || 1);

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

    const handleDelete = async (id) => {
        try { await api.expenses.delete(id); notify("Egreso eliminado"); loadExpenses(); }
        catch (e) { notify(e.message, "err"); }
    };

    const handleCreate = async () => {
        if (!form.description || !form.amount || !form.category_id)
            return notify("Descripción, monto y categoría son obligatorios", "err");
        if (!form.warehouse_id) {
            // Sin almacenes asignados el backend lo rechaza igual: mejor decir por qué.
            return notify(
                warehouses.length
                    ? "Selecciona el almacén al que corresponde el egreso"
                    : "No tienes ningún almacén asignado: pide que te asignen uno para registrar movimientos",
                "err"
            );
        }
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
                date: form.date || null,
                warehouse_id: parseInt(form.warehouse_id),
            });
            notify("Egreso registrado correctamente");
            setShowCreate(false);
            setForm({ description: "", amount: "", category_id: "", payment_journal_id: "", reference: "", notes: "", date: today(), rate: "", warehouse_id: warehouses.length === 1 ? String(warehouses[0].id) : "" });
            loadExpenses();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
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
        deleteConfirm, setDeleteConfirm,
        showCreate, setShowCreate,
        form, setForm, saving,
        warehouses,
        selectedJournal, currentRate, currentSymbol, configuredRate, baseEquivalent,
        toggleFilter, toggleCat, clearFilters,
        handleVoid, handleDelete, handleCreate,
        hasFilters, totalPages,
    };
}
