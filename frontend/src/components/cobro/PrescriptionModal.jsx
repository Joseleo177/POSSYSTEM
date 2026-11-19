import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import DatePicker from "../ui/DatePicker";
import { api } from "../../services/api";
import { resolveImageUrl } from "../../helpers";

const LABEL = "flex items-baseline justify-between gap-2 text-[12px] text-content-subtle mb-1.5";
const Opcional = () => <span className="text-[11px] text-content-subtle/80">Opcional</span>;

export default function PrescriptionModal({
    open, onClose,
    hasControlado, controlledItems = [], recipeItems = [],
    canApprove = false, canSellRecipe = false,
    selectedCustomer,
    onConfirm, // (prescriptionOrNull) => void
    notify,
}) {
    const needsSupervisorPin = (hasControlado && !canApprove) || (!hasControlado && recipeItems.length > 0 && !canSellRecipe && !canApprove);

    const [step, setStep] = useState("form"); // "form" | "pin"
    const [form, setForm] = useState({
        patient_name: "",
        patient_id_doc: "",
        doctor_name: "",
        doctor_license: "",
        prescription_number: "",
        prescription_date: new Date().toISOString().split("T")[0],
        notes: "",
        photo_filename: "",
        photo_url: "",
        approver_pin: "",
    });
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        setStep("form");
        setForm({
            patient_name: selectedCustomer?.name || "",
            patient_id_doc: selectedCustomer?.rif || "",
            doctor_name: "",
            doctor_license: "",
            prescription_number: "",
            prescription_date: new Date().toISOString().split("T")[0],
            notes: "",
            photo_filename: "",
            photo_url: "",
            approver_pin: "",
        });
    }, [open, selectedCustomer]);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const res = await api.sales.uploadPrescriptionPhoto(file);
            const d = res.data || res;
            setForm(prev => ({
                ...prev,
                photo_filename: d.photo_filename || "",
                photo_url: d.photo_url || "",
            }));
            notify?.("Foto del récipe cargada");
        } catch (err) {
            notify?.(err.message || "Error al subir la foto del récipe", "err");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    // La foto del récipe es siempre opcional (por si la caja no tiene cámara).
    const rxOk = !hasControlado || (
        form.patient_name.trim() &&
        form.patient_id_doc.trim() &&
        form.doctor_name.trim()
    );
    const pinOk = form.approver_pin.trim().length >= 4;

    const buildPayload = (includePin = false) => {
        const hasAny = form.photo_filename.trim() || form.patient_name.trim() || form.doctor_name.trim() || includePin;
        if (!hasAny) return null;
        return {
            patient_name: form.patient_name.trim(),
            patient_id_doc: form.patient_id_doc.trim(),
            doctor_name: form.doctor_name.trim(),
            doctor_license: form.doctor_license.trim() || null,
            prescription_number: form.prescription_number.trim() || null,
            prescription_date: form.prescription_date || null,
            notes: form.notes.trim() || null,
            photo_filename: form.photo_filename.trim() || null,
            ...(includePin ? { approver_pin: form.approver_pin.trim() } : {}),
        };
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (hasControlado && !rxOk) {
            notify?.("Completa nombre del paciente, cédula y médico tratante", "err");
            return;
        }
        if (needsSupervisorPin) {
            setStep("pin");
            return;
        }
        onConfirm(buildPayload(false));
    };

    const handlePinSubmit = (e) => {
        e.preventDefault();
        if (!pinOk) {
            notify?.("Ingresa el PIN de autorización del Farmacéutico / Supervisor", "err");
            return;
        }
        onConfirm(buildPayload(true));
    };

    if (!open) return null;

    const allItems = [...controlledItems, ...recipeItems];

    // ── Paso 2: Modal enfocado de Autorización por PIN ─────────
    if (step === "pin") {
        return (
            <Modal
                open={open}
                onClose={onClose}
                title="Autorización del Farmacéutico"
                width={400}
                footer={(
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setStep("form")}
                            className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium"
                        >
                            Volver
                        </button>
                        <Button
                            type="submit"
                            form="rx-pin-form"
                            disabled={!pinOk}
                            className="h-12 sm:h-10 px-5 text-[13px]"
                        >
                            Autorizar y facturar
                        </Button>
                    </div>
                )}
            >
                <form id="rx-pin-form" onSubmit={handlePinSubmit} className="space-y-4">
                    {/* Resumen rápido para que el farmacéutico revise antes de meter el PIN */}
                    <div className="p-3 rounded-xl bg-surface-2/70 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.08] space-y-1 text-[12px]">
                        <div className="font-semibold text-content dark:text-white">
                            {allItems.map(i => i.name).join(" · ")}
                        </div>
                        {(form.patient_name || form.doctor_name) && (
                            <div className="text-content-subtle">
                                {[
                                    form.patient_name && `Paciente: ${form.patient_name}${form.patient_id_doc ? ` (${form.patient_id_doc})` : ""}`,
                                    form.doctor_name && `Médico: ${form.doctor_name}`,
                                ].filter(Boolean).join(" · ")}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={LABEL}><span>PIN de autorización</span></label>
                        <input
                            data-autofocus
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            className="input h-11 text-center text-[18px] tracking-[0.35em] font-semibold tabular-nums"
                            value={form.approver_pin}
                            onChange={e => set("approver_pin", e.target.value)}
                            placeholder="••••"
                        />
                        <p className="mt-1.5 text-[11.5px] text-content-subtle">
                            El farmacéutico o supervisor de turno ingresa su PIN (o contraseña) para autorizar el despacho.
                        </p>
                    </div>
                </form>
            </Modal>
        );
    }

    // ── Paso 1: Datos y foto opcional del récipe ───────────────
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={hasControlado ? "Récipe obligatorio (Medicamento Controlado)" : "Aviso: Medicamento con Récipe"}
            width={560}
            footer={(
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">
                        Cancelar
                    </button>
                    {!hasControlado && !needsSupervisorPin && (
                        <button
                            type="button"
                            onClick={() => onConfirm(null)}
                            className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium"
                        >
                            Omitir récipe
                        </button>
                    )}
                    <Button
                        type="submit"
                        form="prescription-form"
                        disabled={uploading || !rxOk}
                        className="h-12 sm:h-10 px-5 text-[13px]"
                    >
                        {needsSupervisorPin
                            ? "Solicitar autorización"
                            : (hasControlado ? "Guardar récipe y facturar" : "Registrar y facturar")}
                    </Button>
                </div>
            )}
        >
            <form id="prescription-form" onSubmit={handleFormSubmit} className="space-y-4">
                {/* Banner informativo */}
                <div className={`p-3 rounded-xl border text-[12px] ${hasControlado
                    ? "bg-danger/10 border-danger/30 text-danger"
                    : "bg-warning/15 border-warning/30 text-amber-800 dark:text-amber-300"}`}
                >
                    <div className="font-bold">
                        {hasControlado
                            ? "Esta venta incluye psicotrópicos / controlados. Registra los datos del paciente y médico."
                            : "Esta venta incluye medicamentos que requieren récipe médico."}
                    </div>
                    <div className="mt-1 opacity-90">
                        {allItems.map(i => i.name).join(" · ")}
                    </div>
                </div>

                {/* Foto del récipe (opcional) */}
                <div>
                    <label className={LABEL}>
                        <span>Foto del récipe</span>
                        {form.photo_filename ? (
                            <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, photo_filename: "", photo_url: "" }))}
                                className="text-[11px] text-danger hover:underline"
                            >
                                Quitar foto
                            </button>
                        ) : <Opcional />}
                    </label>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFile}
                        className="hidden"
                    />
                    {form.photo_url ? (
                        <div className="relative rounded-xl overflow-hidden border border-border/70 dark:border-white/10 bg-black/5 max-h-52 flex items-center justify-center">
                            <img src={resolveImageUrl(form.photo_url)} alt="Récipe" className="max-h-52 object-contain" />
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-black/70 text-white text-[11px] font-bold hover:bg-black/85"
                            >
                                Cambiar foto
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                            className="w-full py-5 rounded-xl border-2 border-dashed border-border/70 dark:border-white/15 hover:border-brand-500/60 bg-surface-2/40 dark:bg-white/[0.02] flex flex-col items-center justify-center gap-1.5 transition-all"
                        >
                            <svg className="w-7 h-7 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-[12.5px] font-semibold text-content dark:text-white">
                                {uploading ? "Subiendo foto..." : "Tomar foto o subir imagen del récipe"}
                            </span>
                            <span className="text-[11px] text-content-subtle">JPG, PNG o WEBP (máx. 5 MB)</span>
                        </button>
                    )}
                </div>

                {/* Datos del paciente y médico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={LABEL}><span>Nombre del paciente</span>{!hasControlado && <Opcional />}</label>
                        <input className="input h-10" required={hasControlado} value={form.patient_name}
                            onChange={e => set("patient_name", e.target.value)} placeholder="Nombre completo" autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}><span>Cédula / Pasaporte</span>{!hasControlado && <Opcional />}</label>
                        <input className="input h-10" required={hasControlado} value={form.patient_id_doc}
                            onChange={e => set("patient_id_doc", e.target.value)} placeholder="V-12345678" autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}><span>Médico tratante</span>{!hasControlado && <Opcional />}</label>
                        <input className="input h-10" required={hasControlado} value={form.doctor_name}
                            onChange={e => set("doctor_name", e.target.value)} placeholder="Dr. / Dra." autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}><span>MPPS / Colegio médico</span><Opcional /></label>
                        <input className="input h-10" value={form.doctor_license}
                            onChange={e => set("doctor_license", e.target.value)} placeholder="Ej. 45120" autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}><span>N° de récipe / talonario</span><Opcional /></label>
                        <input className="input h-10" value={form.prescription_number}
                            onChange={e => set("prescription_number", e.target.value)} placeholder="Ej. 00142" autoComplete="off" />
                    </div>
                    <div>
                        <label className={LABEL}><span>Fecha del récipe</span><Opcional /></label>
                        <DatePicker value={form.prescription_date} onChange={v => set("prescription_date", v || "")} placeholder="Seleccionar fecha" className="w-full" />
                    </div>
                </div>
            </form>
        </Modal>
    );
}
