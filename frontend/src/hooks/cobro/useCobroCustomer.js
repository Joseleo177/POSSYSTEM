import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import { useDebounce } from "../useDebounce";

export function useCobroCustomer(setSelectedCustomer, notify) {
    const [customers, setCustomers] = useState([]);
    const [custSearch, setCustSearch] = useState("");
    const [selectedCustIdx, setSelectedCustIdx] = useState(-1);
    const [customerModal, setCustomerModal] = useState(false);
    const [customerEditData, setCustomerEditData] = useState(null);
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [debtAlert, setDebtAlert] = useState(null);
    const debouncedCustSearch = useDebounce(custSearch, 300);

    useEffect(() => {
        if (!debouncedCustSearch.trim()) { setCustomers([]); return; }
        api.customers.getAll({ search: debouncedCustSearch })
            .then(r => setCustomers(r.data.filter(c => c.type !== "proveedor")))
            .catch(() => {});
    }, [debouncedCustSearch]);

    // Único punto por donde se elige un cliente en la caja (clic, Enter en la lista o F2).
    // El buscador ya devuelve `total_debt`, así que la deuda se conoce sin pedir nada más.
    // El aviso NO bloquea la venta: solo se levanta para que la cajera lo sepa antes de cobrar.
    const pickCustomer = useCallback((c) => {
        if (!c) return;
        setSelectedCustomer(c);
        setCustomers([]);
        setCustSearch("");
        setSelectedCustIdx(-1);
        const debt = parseFloat(c.total_debt || 0);
        if (debt > 0.01) setDebtAlert({ name: c.name, debt });
    }, [setSelectedCustomer]);

    const saveCustomer = async (form) => {
        if (!form.name) return notify("El nombre es requerido", "err");
        setSavingCustomer(true);
        try {
            const res = await api.customers.create(form);
            notify("Cliente registrado correctamente");
            if (customerEditData?._fromCobro && res?.data) {
                setSelectedCustomer(res.data);
                setCustSearch("");
            }
            setCustomerModal(false);
            setCustomerEditData(null);
        } catch (e) { notify(e.message, "err"); }
        setSavingCustomer(false);
    };

    return {
        customers, setCustomers,
        custSearch, setCustSearch,
        selectedCustIdx, setSelectedCustIdx,
        customerModal, setCustomerModal,
        customerEditData, setCustomerEditData,
        savingCustomer,
        saveCustomer,
        pickCustomer,
        debtAlert, setDebtAlert,
    };
}
