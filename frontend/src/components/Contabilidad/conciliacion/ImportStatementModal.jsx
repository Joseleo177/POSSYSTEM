import { useState, useEffect, useRef, useMemo } from "react";
import Modal from "../../ui/Modal";
import { Button } from "../../ui/Button";
import CustomSelect from "../../ui/CustomSelect";
import Money from "../../ui/Money";
import { Spinner } from "../../ui/Spinner";
import { api } from "../../../services/api";
import { useApp } from "../../../context/AppContext";
import { fmtDateShort, fmtMoney, toNameCase } from "../../../helpers";
import { BANK_FORMATS, suggestFormat, readStatementFile } from "../../../helpers/bankStatements";
import { KIND_LABEL, plural, accountLabel } from "./reconMeta";

const LABEL = "text-[12px] font-medium text-content-subtle";

function Field({ label, hint, children }) {
    return (
        <div className="min-w-0">
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[12px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

const OK_ICON = <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>;
const WARN_ICON = <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.4 0L3.16 16.25A2 2 0 005 19z" /></svg>;

// ¿Se leyó todo? Contra el resumen que imprime el banco, si el archivo lo trae, o encadenando
// los saldos línea a línea. Una fila perdida o duplicada al leer se ve aquí, antes de subir.
function ReadCheck({ check, symbol }) {
    if (!check) return null;
    const box = "px-4 py-2.5 border-t border-border/60 dark:border-white/[0.06] flex items-start gap-2 text-[12px]";
    const s = check.summary;
    if (s) {
        if (check.matches) {
            return (
                <div className={`${box} text-emerald-700 dark:text-emerald-400`}>
                    {OK_ICON}
                    <span>Cuadra con el resumen del banco: {plural(check.count, "movimiento", "movimientos")}, débitos y créditos al céntimo.</span>
                </div>
            );
        }
        const diffs = [
            s.count && s.count !== check.count ? `el banco dice ${s.count} movimientos y se leyeron ${check.count}` : null,
            Math.abs(s.debit - check.debit) >= 0.011 ? `débitos ${fmtMoney(check.debit, symbol)} contra ${fmtMoney(s.debit, symbol)}` : null,
            Math.abs(s.credit - check.credit) >= 0.011 ? `créditos ${fmtMoney(check.credit, symbol)} contra ${fmtMoney(s.credit, symbol)}` : null,
        ].filter(Boolean);
        return (
            <div className={`${box} text-amber-700 dark:text-amber-400`}>
                {WARN_ICON}
                <span>No cuadra con el resumen del banco: {diffs.join("; ")}. Revisa el archivo antes de subirlo.</span>
            </div>
        );
    }
    if (!check.chained) return null;
    return check.breaks === 0 ? (
        <div className={`${box} text-emerald-700 dark:text-emerald-400`}>
            {OK_ICON}
            <span>Los saldos encadenan de la primera a la última línea: no falta ningún movimiento.</span>
        </div>
    ) : (
        <div className={`${box} text-amber-700 dark:text-amber-400`}>
            {WARN_ICON}
            <span>El saldo salta en {plural(check.breaks, "línea", "líneas")}: puede faltar algún movimiento o el banco los ordenó distinto.</span>
        </div>
    );
}

/**
 * Subir un extracto: cuenta, sucursal, formato del banco y archivo. El archivo se lee aquí
 * mismo y se muestra la vista previa —cuántos movimientos, qué período, cuántas comisiones—
 * antes de mandarlo. Al subirlo, el servidor casa solo lo que no admite duda.
 */
export default function ImportStatementModal({ open, onClose, accounts, initialAccountKey, notify, onDone }) {
    const { can } = useApp();
    const isAdmin = can("admin");
    const fileRef = useRef(null);

    const [accountKey, setAccountKey] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [format, setFormat] = useState("generico");
    const [file, setFile] = useState(null);
    const [parsed, setParsed] = useState(null);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState("");
    const [warehouses, setWarehouses] = useState([]);

    useEffect(() => {
        if (!open) return;
        const first = initialAccountKey || (accounts.length === 1 ? accounts[0].key : "");
        setAccountKey(first);
        setFile(null); setParsed(null); setError("");
        api.warehouses.getAll().then(r => setWarehouses((r.data || []).filter(w => w.sells !== false))).catch(() => {});
    }, [open, initialAccountKey, accounts]);

    const account = accounts.find(a => a.key === accountKey) || null;

    // Formato sugerido por el banco de la cuenta; se puede cambiar a mano.
    useEffect(() => { if (account) setFormat(suggestFormat(account)); }, [account?.key]);

    // Sucursales que la cuenta atiende. Si todos sus diarios son compartidos, cualquiera.
    const warehouseOptions = useMemo(() => {
        if (!account) return [];
        const pool = account.warehouse_ids.length && account.journals.every(j => j.warehouse_ids.length)
            ? warehouses.filter(w => account.warehouse_ids.includes(w.id))
            : warehouses;
        return pool.map(w => ({ value: String(w.id), label: toNameCase(w.name) }));
    }, [account, warehouses]);

    useEffect(() => {
        if (!account) return;
        // El admin puede tomar la cuenta entera; un encargado, solo su sucursal.
        if (isAdmin) setWarehouseId("");
        else setWarehouseId(warehouseOptions[0]?.value || "");
    }, [account?.key, isAdmin, warehouseOptions.length]);

    const read = async (f, fmt) => {
        if (!f) return;
        setReading(true); setError(""); setParsed(null);
        try {
            setParsed(await readStatementFile(f, fmt));
        } catch (e) {
            setError(e.message || "No se pudo leer el archivo");
        } finally {
            setReading(false);
        }
    };

    const pickFile = (f) => { setFile(f); read(f, format); };
    const changeFormat = (fmt) => { setFormat(fmt); if (file) read(file, fmt); };

    const summary = useMemo(() => {
        if (!parsed) return null;
        const ls = parsed.lines;
        const dates = ls.map(l => l.date).sort();
        const charges = ls.filter(l => l.kind !== "movimiento");
        return {
            count: ls.length,
            from: dates[0], to: dates[dates.length - 1],
            credit: ls.reduce((s, l) => s + l.credit, 0),
            debit: ls.reduce((s, l) => s + l.debit, 0),
            charges: charges.length,
        };
    }, [parsed]);

    const symbol = account?.currency_symbol || "Ref.";

    const submit = async () => {
        try {
            const r = await api.reconciliation.create({
                journal_id: account.journal_id,
                currency_id: account.currency_id,
                warehouse_id: warehouseId || null,
                bank_format: format,
                filename: file?.name || null,
                lines: parsed.lines,
            });
            const st = r.stats || {};
            const partes = [`${plural(st.created, "movimiento cargado", "movimientos cargados")}`, `${st.matched} casados solos`];
            if (st.duplicated) partes.push(`${st.duplicated} ya estaban en otro extracto`);
            notify(partes.join(" · "));
            onDone(r.data.id);
        } catch (e) {
            notify(e.message, "err");
        }
    };

    const ready = account && parsed && !reading && (isAdmin || warehouseId);

    return (
        <Modal open={open} onClose={onClose} title="Subir extracto bancario" width={680}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-semibold">Cancelar</button>
                    {ready && (
                        <Button onClick={submit} className="h-12 sm:h-10">
                            Subir y casar {plural(summary.count, "movimiento", "movimientos")}
                        </Button>
                    )}
                </div>
            }>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cuenta">
                        <CustomSelect
                            value={accountKey}
                            onChange={setAccountKey}
                            placeholder="Elige la cuenta"
                            options={accounts.map(a => ({ value: a.key, label: toNameCase(accountLabel(a)) }))}
                        />
                    </Field>
                    <Field label="Sucursal" hint={isAdmin ? "Opcional" : null}>
                        <CustomSelect
                            value={warehouseId}
                            onChange={setWarehouseId}
                            disabled={!account}
                            placeholder="Elige la sucursal"
                            options={[
                                ...(isAdmin ? [{ value: "", label: "Toda la cuenta" }] : []),
                                ...warehouseOptions,
                            ]}
                        />
                    </Field>
                </div>

                <Field label="Formato del banco">
                    <CustomSelect value={format} onChange={changeFormat} options={BANK_FORMATS.map(f => ({ value: f.key, label: f.label }))} />
                </Field>

                <div>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,.pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }} />
                    <button type="button" onClick={() => fileRef.current?.click()}
                        className="w-full rounded-xl border border-dashed border-border dark:border-white/15 px-4 py-5 flex items-center gap-3 text-left hover:border-content-subtle/60 dark:hover:border-white/30 transition-colors">
                        <span className="w-10 h-10 rounded-xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle shrink-0">
                            {reading ? <Spinner /> : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-6m3 6V9m3 8v-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            )}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-content dark:text-white truncate">{file ? file.name : "Elegir archivo del extracto"}</span>
                            <span className="block text-[12px] text-content-subtle">{file ? "Toca para cambiarlo" : "Excel, CSV o el PDF del Banco de Venezuela, tal como lo descargas de la banca en línea"}</span>
                        </span>
                    </button>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2.5 text-[13px] text-red-700 dark:text-red-300">{error}</div>
                )}

                {parsed && summary && (
                    <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] overflow-hidden">
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 px-4 py-3 bg-surface-2/60 dark:bg-white/[0.02]">
                            <div><dt className={LABEL}>Movimientos</dt><dd className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{summary.count}</dd></div>
                            <div><dt className={LABEL}>Período</dt><dd className="text-[13px] font-medium text-content dark:text-white tabular-nums">{fmtDateShort(summary.from, { day: "2-digit", month: "2-digit" })} al {fmtDateShort(summary.to, { day: "2-digit", month: "2-digit" })}</dd></div>
                            <div><dt className={LABEL}>Abonos</dt><dd><Money value={fmtMoney(summary.credit, symbol)} className="text-[13px] font-medium text-content dark:text-white" /></dd></div>
                            <div><dt className={LABEL}>Cargos</dt><dd><Money value={`-${fmtMoney(summary.debit, symbol)}`} className="text-[13px] font-medium text-content dark:text-white" /></dd></div>
                        </dl>
                        <ReadCheck check={parsed.check} symbol={symbol} />
                        {(summary.charges > 0 || parsed.warnings.length > 0) && (
                            <div className="px-4 py-2.5 border-t border-border/60 dark:border-white/[0.06] space-y-1">
                                {summary.charges > 0 && (
                                    <p className="text-[12px] text-content-subtle">El banco marcó {plural(summary.charges, "línea como comisión, impuesto o interés", "líneas como comisión, impuesto o interés")}: las podrás registrar de una vez.</p>
                                )}
                                {parsed.warnings.map(w => <p key={w} className="text-[12px] text-amber-700 dark:text-amber-400">{w}</p>)}
                            </div>
                        )}
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06] max-h-64 overflow-y-auto">
                            {parsed.lines.slice(0, 40).map((l, i) => (
                                <div key={i} className="px-4 py-2 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[13px] text-content dark:text-white truncate">{l.description}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums truncate">
                                            {fmtDateShort(l.date)}{l.reference ? ` · Ref. ${l.reference}` : ""}{KIND_LABEL[l.kind] ? ` · ${KIND_LABEL[l.kind]}` : ""}
                                        </div>
                                    </div>
                                    <Money value={`${l.credit > 0 ? "" : "-"}${fmtMoney(l.credit || l.debit, symbol)}`} className="text-[13px] font-medium text-content dark:text-white shrink-0" />
                                </div>
                            ))}
                            {parsed.lines.length > 40 && (
                                <div className="px-4 py-2 text-[12px] text-content-subtle">y {parsed.lines.length - 40} más</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
