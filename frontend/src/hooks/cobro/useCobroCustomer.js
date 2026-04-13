import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useDebounce } from "../useDebounce";

export function useCobroCustomer(setSelectedCustomer, notify) {
    const [customers, setCustomers] = useState([]);
    const [custSearch, setCustSearch] = useState("");
    const [selectedCustIdx, setSelectedCustIdx] = useState(-1);
    const [customerModal, setCustomerModal] = useState(false);
    const [customerEditData, setCustomerEditData] = useState(null);
    const [savingCustomer, setSavingCustomer] = useState(false);
    const debouncedCustSearch = useDebounce(custSearch, 300);

    useEffect(() => {
        if (!debouncedCustSearch.trim()) { setCustomers([]); return; }
        api.customers.getAll({ search: debouncedCustSearch })
            .then(r => setCustomers(r.data.filter(c => c.type !== "proveedor")))
            .catch(() => {});
    }, [debouncedCustSearch]);

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
    };
}
