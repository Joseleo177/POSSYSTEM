import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import CustomSelect from "../ui/CustomSelect";
import { toNameCase } from "../../helpers";

// El cliente de la cuenta, desde la mesa: el mesonero lo busca por nombre, cédula o teléfono, o
// lo registra con lo justo (cédula, nombre y teléfono). Va por las rutas de mesas
// (services/mesaCuentas.js) porque el mesonero no tiene permisos de Clientes. Nunca muestra
// saldos ni deudas: la tablet se le enseña al cliente.

const DOC_PREFIXES = ["V", "E", "J", "G", "P"];
const RIF_PREFIXES = ["J", "G", "P"];
const INPUT = "w-full h-12 sm:h-11 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const Svg = ({ d, className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);
const LUPA = "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z";
const PERSONA = "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z";
const MAS = "M12 5v14M5 12h14";

/**
 * value: cliente actual ({ id, name, rif }) o null. onPick(cliente | null) devuelve una promesa:
 * la ventana se cierra cuando termina bien.
 */
export default function ClienteMesa({ value, onPick, onClose, notify }) {
    const [modo, setModo] = useState("buscar");   // buscar · nuevo
    const [q, setQ] = useState("");
    const [lista, setLista] = useState(null);
    const [buscando, setBuscando] = useState(false);
    const [form, setForm] = useState({ prefix: "V", doc: "", name: "", phone: "" });
    const pedido = useRef(0);

    // Búsqueda con una pausa corta: en la tablet se teclea despacio y cada letra sería una petición.
    useEffect(() => {
        const t = q.trim();
        if (t.length < 2) { setLista(null); setBuscando(false); return; }
        setBuscando(true);
        const n = ++pedido.current;
        const h = setTimeout(() => {
            api.tables.findCustomers(t)
                .then(r => { if (n === pedido.current) setLista(r.data || []); })
                .catch(e => { if (n === pedido.current) { setLista([]); notify(e.message || "No se pudo buscar", "err"); } })
                .finally(() => { if (n === pedido.current) setBuscando(false); });
        }, 300);
        return () => clearTimeout(h);
    }, [q, notify]);

    // "Registrar" arranca con lo que se escribió: números = cédula; letras = nombre.
    const irANuevo = () => {
        const t = q.trim();
        const soloNum = t.replace(/\D/g, "");
        const conLetra = t.toUpperCase().match(/^([VEJGP])[-\s]?(\d{6,9})$/);
        setForm({
            prefix: conLetra ? conLetra[1] : "V",
            doc: conLetra ? conLetra[2] : (/^\d+$/.test(t.replace(/[\s.-]/g, "")) ? soloNum : ""),
            name: /\d/.test(t) ? "" : t.toUpperCase(),
            phone: "",
        });
        setModo("nuevo");
    };

    const elegir = async (c) => {
        try {
            await onPick(c);
            onClose();
        } catch (e) {
            notify(e.message || "No se pudo poner el cliente", "err");
        }
    };

    const maxDoc = RIF_PREFIXES.includes(form.prefix) ? 9 : 8;
    const listo = form.doc.length >= 6 && form.name.trim().length >= 3;
    const registrar = async () => {
        if (!listo) return;
        try {
            const r = await api.tables.createCustomer({
                document: `${form.prefix}-${form.doc}`,
                name: form.name.trim(),
                phone: form.phone.trim() || undefined,
            });
            if (r.existing) notify(`Esa cédula ya estaba registrada: ${toNameCase(r.data?.name)}`);
            await elegir(r.data);
        } catch (e) {
            notify(e.message || "No se pudo registrar el cliente", "err");
        }
    };

    const pie = modo === "nuevo" ? (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 w-full">
            <button type="button" onClick={() => setModo("buscar")} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Volver</button>
            {listo && <Button className="h-12 sm:h-10 px-5" onClick={registrar}>Registrar y poner en la cuenta</Button>}
        </div>
    ) : null;

    return (
        <Modal open onClose={onClose} title={modo === "nuevo" ? "Registrar cliente" : "Cliente de la cuenta"} width={480} footer={pie}>
            {modo === "buscar" ? (
                <div className="space-y-3">
                    {value && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2 dark:bg-white/[0.05]">
                            <span className="w-9 h-9 rounded-full bg-white dark:bg-white/10 flex items-center justify-center text-content-subtle shrink-0"><Svg d={PERSONA} /></span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(value.name)}</div>
                                {value.rif && <div className="text-[12px] text-content-subtle tabular-nums">{value.rif}</div>}
                            </div>
                            <Button variant="ghost" className="h-10 px-3 text-[13px]" onClick={() => elegir(null)}>Quitar</Button>
                        </div>
                    )}
                    <label className="relative block">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle"><Svg d={LUPA} /></span>
                        <input data-autofocus value={q} onChange={e => setQ(e.target.value)} type="search" autoComplete="off"
                            placeholder="Nombre, cédula o teléfono" className={`${INPUT} pl-10`} />
                    </label>

                    {buscando && <div className="py-4 flex justify-center"><Spinner /></div>}
                    {!buscando && lista && lista.length > 0 && (
                        <ul className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06]">
                            {lista.map(c => (
                                <li key={c.id}>
                                    <button type="button" onClick={() => elegir(c)}
                                        className="w-full min-h-[56px] py-2.5 flex items-center gap-3 text-left active:bg-surface-2 dark:active:bg-white/[0.04]">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(c.name)}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums truncate">{[c.rif, c.phone].filter(Boolean).join(" · ") || "Sin cédula"}</div>
                                        </div>
                                        {value?.id === c.id && <span className="text-[12px] text-content-subtle shrink-0">En la cuenta</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {!buscando && lista && lista.length === 0 && (
                        <p className="py-2 text-[13px] text-content-subtle text-center">Nadie registrado con «{q.trim()}».</p>
                    )}

                    <button type="button" onClick={irANuevo}
                        className="w-full h-12 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-semibold text-content dark:text-white inline-flex items-center justify-center gap-2">
                        <Svg d={MAS} /> Registrar cliente nuevo
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <label className="block space-y-1.5">
                        <span className="text-[12px] text-content-subtle">Cédula o RIF</span>
                        <div className="flex gap-2">
                            <CustomSelect
                                value={form.prefix}
                                onChange={v => setForm(f => ({ ...f, prefix: v, doc: f.doc.slice(0, RIF_PREFIXES.includes(v) ? 9 : 8) }))}
                                options={DOC_PREFIXES.map(p => ({ value: p, label: `${p}-` }))}
                                height="h-12 sm:h-11"
                                menuMinWidth={104}
                                className="shrink-0"
                                boxClassName="w-[56px] !px-1.5 font-bold rounded-lg"
                            />
                            <input data-autofocus value={form.doc} inputMode="numeric" autoComplete="off" maxLength={maxDoc}
                                onChange={e => setForm(f => ({ ...f, doc: e.target.value.replace(/\D/g, "") }))}
                                placeholder={"0".repeat(maxDoc)} className={`${INPUT} flex-1 min-w-0 tabular-nums`} />
                        </div>
                    </label>
                    <label className="block space-y-1.5">
                        <span className="text-[12px] text-content-subtle">Nombre completo</span>
                        <input value={form.name} autoComplete="off" maxLength={200}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))}
                            placeholder="JUAN PÉREZ" className={INPUT} />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="flex items-baseline justify-between text-[12px] text-content-subtle">Teléfono <span>Opcional</span></span>
                        <input value={form.phone} inputMode="tel" autoComplete="off" maxLength={20}
                            onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d\s+\-()]/g, "") }))}
                            placeholder="0414 1234567" className={`${INPUT} tabular-nums`} />
                    </label>
                </div>
            )}
        </Modal>
    );
}
