import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import { toNameCase } from "../../helpers";

/**
 * Repartir en sectores los clientes que todavía no tienen uno (los que ya existían antes de la
 * cobranza, o los que se dieron de alta en la caja). Uno por uno también se puede, desde la ficha
 * del contacto.
 */
export default function AsignarClientesModal({ sectores, onClose, onSaved }) {
    const { notify } = useApp();
    const [search, setSearch] = useState("");
    const term = useDebounce(search, 300);
    const [clientes, setClientes] = useState(null);
    const [marcados, setMarcados] = useState(() => new Set());
    const [sector, setSector] = useState(sectores.length === 1 ? String(sectores[0].id) : "");

    useEffect(() => {
        let vivo = true;
        api.cobranza.clientes({ sector_id: "none", ...(term.trim() ? { search: term.trim() } : {}) })
            .then(r => { if (vivo) setClientes(r.data || []); })
            .catch(e => { if (vivo) { notify(e.message, "err"); setClientes([]); } });
        return () => { vivo = false; };
    }, [term]);   // eslint-disable-line react-hooks/exhaustive-deps

    const visibles = clientes || [];
    const todos = visibles.length > 0 && visibles.every(c => marcados.has(c.id));
    const toggle = (id) => setMarcados(p => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s; });
    const toggleTodos = () => setMarcados(p => {
        const s = new Set(p);
        if (todos) visibles.forEach(c => s.delete(c.id)); else visibles.forEach(c => s.add(c.id));
        return s;
    });
    const nombreSector = useMemo(() => sectores.find(s => String(s.id) === sector)?.name, [sectores, sector]);

    const guardar = async () => {
        try {
            await api.cobranza.asignar({ sector_id: parseInt(sector), customer_ids: [...marcados] });
            notify(`${marcados.size} ${marcados.size === 1 ? "cliente pasó" : "clientes pasaron"} a ${nombreSector}`);
            onSaved?.();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <Modal open onClose={onClose} title="Clientes sin sector" width={520}>
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente" autoComplete="off"
                        className="h-10 flex-1 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    <CustomSelect value={sector} onChange={setSector} className="sm:w-48"
                        options={sectores.map(s => ({ value: String(s.id), label: s.name }))} placeholder="Pasar a…" />
                </div>

                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-[50vh] lg:overflow-y-auto custom-scrollbar">
                    {clientes === null ? (
                        <p className="px-3.5 py-3 text-[13px] text-content-subtle">Cargando…</p>
                    ) : visibles.length === 0 ? (
                        <p className="px-3.5 py-3 text-[13px] text-content-subtle">{term ? "Nadie coincide" : "Todos los clientes tienen sector"}</p>
                    ) : (
                        <>
                            <div role="button" tabIndex={0} onClick={toggleTodos} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTodos(); } }} className="w-full px-3.5 py-2 flex items-center gap-3 text-left cursor-pointer bg-surface-2/50 dark:bg-white/[0.02]">
                                <Check checked={todos} onChange={toggleTodos} title="Todos" />
                                <span className="text-[12px] font-medium text-content-subtle">Marcar los {visibles.length} de la lista</span>
                            </div>
                            {visibles.map(c => (
                                <div key={c.id} role="button" tabIndex={0} onClick={() => toggle(c.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(c.id); } }} className="w-full px-3.5 py-2.5 flex items-center gap-3 text-left cursor-pointer">
                                    <Check checked={marcados.has(c.id)} onChange={() => toggle(c.id)} title={c.name} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(c.name)}</span>
                                        <span className="block text-[12px] text-content-subtle truncate">{[c.rif, c.address || c.phone].filter(Boolean).join(" · ")}</span>
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Cerrar</button>
                    {marcados.size > 0 && sector && (
                        <Button onClick={guardar} className="!h-12 sm:!h-10 sm:flex-1">Pasar {marcados.size} a {nombreSector}</Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
