import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import SucursalFilter, { useSucursalFilter } from "../../components/ui/SucursalFilter";
import DatePicker from "../../components/ui/DatePicker";
import StatusMark, { PRESCRIPTION_STATUS } from "../../components/ui/StatusMark";
import Modal from "../../components/ui/Modal";
import { resolveImageUrl } from "../../helpers";

const todayISO = () => new Date().toISOString().split("T")[0];
const monthAgoISO = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export default function PrescriptionsReport() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [from, setFrom] = useState(monthAgoISO);
    const [to, setTo] = useState(todayISO);
    const [ptype, setPtype] = useState("all"); // all | controlado | recipe
    const [search, setSearch] = useState("");
    const [photoModal, setPhotoModal] = useState(null);
    const suc = useSucursalFilter();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { from, to };
            if (suc.warehouseId) params.warehouse_id = suc.warehouseId;
            if (ptype !== "all") params.prescription_type = ptype;
            if (search.trim()) params.search = search.trim();
            const r = await api.reports.prescriptions(params);
            setRows(r.data || []);
        } catch (e) {
            console.error(e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [from, to, suc.warehouseId, ptype, search]);

    useEffect(() => {
        const t = setTimeout(load, 200);
        return () => clearTimeout(t);
    }, [load]);

    const exportCSV = () => {
        if (!rows.length) return;
        const headers = ["Fecha", "Factura", "Sucursal", "Medicamento", "Principio Activo", "Tipo", "Cantidad", "Presentación", "Paciente", "Cédula", "Médico", "MPPS", "N° Récipe", "Autorizado por"];
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [
            headers.map(esc).join(","),
            ...rows.map(r => [
                new Date(r.sale_date).toLocaleString("es-VE"),
                r.invoice_number || `#${r.sale_id}`,
                r.warehouse_name || "",
                r.product_name,
                r.active_ingredient || "",
                r.prescription_type === "controlado" ? "Controlado" : "Récipe",
                r.quantity,
                r.unit_label || "unidad",
                r.patient_name,
                r.patient_id_doc,
                r.doctor_name,
                r.doctor_license || "",
                r.prescription_number || "",
                r.approver_name || r.employee_name || "",
            ].map(esc).join(","))
        ];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `control-recipes-${from}-a-${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-white/[0.03] border border-border/60 dark:border-white/10 rounded-2xl p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <DatePicker value={from} onChange={v => setFrom(v || monthAgoISO())} className="w-36" />
                    <span className="text-[11px] text-content-subtle">a</span>
                    <DatePicker value={to} onChange={v => setTo(v || todayISO())} className="w-36" />
                    <div className="flex gap-1">
                        {[
                            { k: "all", label: "Todos" },
                            { k: "controlado", label: "Controlados" },
                            { k: "recipe", label: "Con récipe" },
                        ].map(f => (
                            <button
                                key={f.k}
                                type="button"
                                onClick={() => setPtype(f.k)}
                                className={`px-3 h-9 rounded-lg text-[11.5px] font-bold transition-all ${ptype === f.k
                                    ? "bg-brand-500/15 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40"
                                    : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar paciente, cédula, médico, medicamento..."
                        className="input h-9 text-[12px] w-64"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <SucursalFilter filter={suc} boxClassName="h-9 min-w-[160px]" />
                    <button
                        type="button"
                        disabled={!rows.length}
                        onClick={exportCSV}
                        className="btn-outline h-9 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                    >
                        Exportar CSV
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white dark:bg-white/[0.02] border border-border/60 dark:border-white/10 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="p-16 text-center text-[12px] text-content-subtle animate-pulse">
                        Cargando libro de control de récipes...
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-16 text-center text-[12.5px] text-content-subtle">
                        No hay registros de récipes en el período seleccionado.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[12px]">
                            <thead>
                                <tr className="border-b border-border/60 dark:border-white/10 text-[11px] uppercase tracking-wider text-content-subtle bg-surface-2/50 dark:bg-white/[0.02]">
                                    <th className="py-2.5 px-3">Fecha / Factura</th>
                                    <th className="py-2.5 px-3">Medicamento</th>
                                    <th className="py-2.5 px-3">Cant.</th>
                                    <th className="py-2.5 px-3">Paciente</th>
                                    <th className="py-2.5 px-3">Médico / Récipe</th>
                                    <th className="py-2.5 px-3">Autorizó</th>
                                    <th className="py-2.5 px-3 text-right">Foto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40 dark:divide-white/5">
                                {rows.map(r => (
                                    <tr key={`${r.prescription_id}-${r.sale_item_id}`} className="hover:bg-surface-2/40 dark:hover:bg-white/[0.02]">
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <div className="font-semibold text-content dark:text-white tabular-nums">
                                                {new Date(r.sale_date).toLocaleDateString("es-VE")}
                                            </div>
                                            <div className="text-[11px] text-content-subtle">
                                                {r.invoice_number || `#${r.sale_id}`} {r.warehouse_name ? `· ${r.warehouse_name}` : ""}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-content dark:text-white">{r.product_name}</span>
                                                <StatusMark status={r.prescription_type} map={PRESCRIPTION_STATUS} />
                                            </div>
                                            {(r.active_ingredient || r.concentration) && (
                                                <div className="text-[11px] text-content-subtle">
                                                    {[r.active_ingredient, r.concentration].filter(Boolean).join(" · ")}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap tabular-nums font-semibold">
                                            {r.quantity} <span className="text-[11px] font-normal text-content-subtle">{r.unit_label || "und"}</span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="font-semibold text-content dark:text-white">{r.patient_name}</div>
                                            <div className="text-[11px] text-content-subtle tabular-nums">{r.patient_id_doc}</div>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="font-semibold text-content dark:text-white">{r.doctor_name}</div>
                                            <div className="text-[11px] text-content-subtle">
                                                {[r.doctor_license && `MPPS: ${r.doctor_license}`, r.prescription_number && `N° ${r.prescription_number}`].filter(Boolean).join(" · ") || "—"}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <div className="font-medium text-content dark:text-white">{r.approver_name || "—"}</div>
                                            {r.employee_name && r.approver_name && r.employee_name !== r.approver_name && (
                                                <div className="text-[11px] text-content-subtle">Cajero: {r.employee_name}</div>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                            {r.photo_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotoModal(r)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-700 dark:text-brand-300 text-[11px] font-bold transition-colors"
                                                >
                                                    Ver foto
                                                </button>
                                            ) : (
                                                <span className="text-[11px] text-content-subtle opacity-60">Sin foto</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Visor de foto del récipe */}
            <Modal
                open={!!photoModal}
                onClose={() => setPhotoModal(null)}
                title={photoModal ? `Récipe · ${photoModal.patient_name} (${photoModal.invoice_number || `#${photoModal.sale_id}`})` : ""}
                width={680}
            >
                {photoModal && (
                    <div className="space-y-3">
                        <div className="rounded-xl overflow-hidden bg-black/5 dark:bg-black/30 border border-border/60 dark:border-white/10 flex items-center justify-center max-h-[65vh]">
                            <img src={resolveImageUrl(photoModal.photo_url)} alt="Foto del récipe" className="max-h-[65vh] object-contain" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px] p-3 rounded-xl bg-surface-2/60 dark:bg-white/[0.03]">
                            <div><span className="text-content-subtle block text-[10.5px]">Paciente</span><strong>{photoModal.patient_name}</strong> ({photoModal.patient_id_doc})</div>
                            <div><span className="text-content-subtle block text-[10.5px]">Médico</span><strong>{photoModal.doctor_name}</strong> {photoModal.doctor_license ? `· ${photoModal.doctor_license}` : ""}</div>
                            <div><span className="text-content-subtle block text-[10.5px]">N° Récipe</span><strong>{photoModal.prescription_number || "—"}</strong></div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
