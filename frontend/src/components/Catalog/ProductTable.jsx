import { fmtBase } from "../../helpers";
import { useApp } from "../../context/AppContext";

export default function ProductTable({ products, canManageProducts, openEditProduct, setDeleteProductDialog }) {
    const { baseCurrency } = useApp();
    const fmtPrice = (n) => fmtBase(n, baseCurrency);

    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
                <tr className="border-b border-border/30 dark:border-white/5">
                    <th className="px-4 py-2.5 w-12" />
                    <th className="px-4 py-2.5 text-[11px] font-black uppercase text-content-subtle">Producto</th>
                    <th className="px-4 py-2.5 text-[11px] font-black uppercase text-content-subtle">Stock</th>
                    <th className="px-4 py-2.5 text-[11px] font-black uppercase text-content-subtle">Precio</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-black uppercase text-content-subtle">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
                {products.map(p => (
                    <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2">
                            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-[11px] font-black border border-white/5">
                                {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover rounded-lg" /> : p.name.charAt(0)}
                            </div>
                        </td>
                        <td className="px-4 py-2">
                            <div className="text-[11px] font-black uppercase tracking-tight">{p.name}</div>
                            <div className="text-[10px] font-bold opacity-30 uppercase">{p.category_name || "General"}</div>
                        </td>
                        <td className="px-4 py-2 text-[11px] font-black tabular-nums">
                            {p.warehouse_stock !== undefined ? (
                                <span className={parseFloat(p.warehouse_stock) <= 5 ? "text-warning" : parseFloat(p.warehouse_stock) <= 0 ? "text-danger" : "text-success"}>
                                    {p.warehouse_stock}
                                </span>
                            ) : (
                                <span className={parseFloat(p.stock) <= 5 ? "text-warning" : parseFloat(p.stock) <= 0 ? "text-danger" : "text-success"}>
                                    {p.stock}
                                </span>
                            )}
                            <span className="ml-1 opacity-30 font-bold uppercase">{p.unit || "uds"}</span>
                        </td>
                        <td className="px-4 py-2 text-[11px] font-black text-brand-500">{fmtPrice(p.price)}</td>
                        <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => openEditProduct(p)} className="w-7 h-7 rounded-lg bg-warning/10 text-warning flex items-center justify-center hover:bg-warning hover:text-black">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button onClick={() => setDeleteProductDialog(p.id)} className="w-7 h-7 rounded-lg bg-danger/10 text-danger flex items-center justify-center hover:bg-danger hover:text-white">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}