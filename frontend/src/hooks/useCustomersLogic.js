import { useState } from "react";
import { useCustomers } from "./useCustomers"; // Hook base de datos
import { useApp } from "../context/AppContext";

export function useCustomersLogic() {
    const { notify, baseCurrency } = useApp();
    const methods = useCustomers(notify);

    const [customerModal, setCustomerModal] = useState(false);
    const [customerEditData, setCustomerEditData] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [payModal, setPayModal] = useState(null);

    const openNew = (type) => {
        setCustomerEditData({ _newType: type });
        setCustomerModal(true);
    };

    const openEdit = (c) => {
        setCustomerEditData(c);
        setCustomerModal(true);
        if (methods.detail) methods.closeDetail();
    };

    const onSave = async (form) => {
        const ok = await methods.save(form, customerEditData?.id);
        if (ok) setCustomerModal(false);
    };

    return {
        ...methods,
        baseCurrency,
        customerModal,
        customerEditData,
        deleteConfirm,
        setDeleteConfirm,
        payModal,
        setPayModal,
        openNew,
        openEdit,
        onSave,
        closeModal: () => { setCustomerModal(false); setCustomerEditData(null); }
    };
}