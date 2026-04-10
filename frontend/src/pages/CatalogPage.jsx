import { useState, useEffect } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { Button } from "../components/ui/Button";
import ProductTable from "../components/Catalog/ProductTable";
import ProductModal from "../components/ProductModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import { useDebounce } from "../hooks/useDebounce";
import { api } from "../services/api";

export default function CatalogPage() {
    const { products, search, setSearch, loadProducts, can, categories, notify, loading } = useCatalog();
    const debouncedSearch = useDebounce(search, 400);

    const [productModal, setProductModal] = useState(false);
    const [productEditData, setProductEditData] = useState(null);
    const [deleteProductDialog, setDeleteProductDialog] = useState(null);

    useEffect(() => { loadProducts(); }, [debouncedSearch]);

    const confirmDelete = async () => {
        try {
            await api.products.remove(deleteProductDialog);
            notify("Producto eliminado");
            setDeleteProductDialog(null);
            loadProducts();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <div className="h-full flex flex-col bg-transparent">

            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                <div>
                    <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Módulo</div>
                    <h1 className="text-sm font-black uppercase tracking-tight">Catálogo</h1>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => { setProductEditData(null); setProductModal(true); }}>+ NUEVO PRODUCTO</Button>
                </div>
            </div>

            <div className="px-4 py-2 bg-white/[0.02]">
                <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="h-8 w-full max-w-xs px-3 bg-white/5 border border-white/10 rounded-lg text-[11px] focus:border-brand-500 outline-none"
                    placeholder="Buscar producto..."
                />
            </div>

            <div className="flex-1 overflow-auto">
                <ProductTable
                    products={products}
                    canManageProducts={can("products")}
                    openEditProduct={(p) => { setProductEditData(p); setProductModal(true); }}
                    setDeleteProductDialog={setDeleteProductDialog}
                />
            </div>

            <ProductModal
                open={productModal}
                onClose={() => setProductModal(false)}
                onSave={() => { setProductModal(false); loadProducts(); }}
                editData={productEditData}
                categories={categories}
                loading={loading}
            />

            <ConfirmModal
                isOpen={!!deleteProductDialog}
                title="¿Eliminar Producto?"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteProductDialog(null)}
                type="danger"
            />
        </div>
    );
}