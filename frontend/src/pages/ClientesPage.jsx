import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import CustomerModal from "../components/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";
import { exportToCSV } from "../utils/exportUtils";
import DataTable from "../components/DataTable";

export default function ClientesPage() {
  const { notify, baseCurrency } = useApp();

  const fmtPrice = (n) => `${baseCurrency?.symbol || "$"}${Number(n).toFixed(2)}`;
  const fmtSale  = (sale, amount) => {
    const isBase = !sale.currency_id || sale.currency_id === baseCurrency?.id;
    if (isBase) return fmtPrice(amount);
    const sym  = sale.currency_symbol || "$";
    const rate = parseFloat(sale.exchange_rate) || 1;
    return `${sym}${(parseFloat(amount || 0) * rate).toFixed(2)}`;
  };

  // ── State ──────────────────────────────────────────────────
  const [customers, setCustomers]           = useState([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [page, setPage]                     = useState(1);
  const LIMIT = 50;

  const [customerSearch, setCustomerSearch] = useState("");
  const [typeFilter, setTypeFilter]         = useState("cliente");
  const [customerDetail, setCustomerDetail] = useState(null);
  const [purchases, setPurchases]           = useState([]);

  // Modal crear/editar
  const [customerModal, setCustomerModal]     = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [saving, setSaving]                   = useState(false);

  // Pago de cuenta pendiente
  const [payModal, setPayModal] = useState(null);

  // Reset pagina al cambiar filtros
  useEffect(() => { setPage(1); }, [customerSearch, typeFilter]);

  // ── Loaders ────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    try {
      const params = {
        limit: LIMIT,
        offset: (page - 1) * LIMIT
      };
      if (customerSearch) params.search = customerSearch;
      if (typeFilter) params.type = typeFilter;
      const r = await api.customers.getAll(params);
      setCustomers(r.data);
      setTotalCustomers(r.total || r.data.length);
    } catch (e) { notify(e.message, "err"); }
  }, [customerSearch, typeFilter, page, notify]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const openDetail = async (c) => {
    setCustomerDetail(c);
    try {
      const r = await api.customers.getPurchases(c.id);
      setPurchases(r.data);
    } catch (e) { notify(e.message, "err"); }
  };

  const refreshDetail = async () => {
    if (!customerDetail) return;
    try {
      const [cR, pR] = await Promise.all([
        api.customers.getOne(customerDetail.id),
        api.customers.getPurchases(customerDetail.id),
      ]);
      setCustomerDetail(cR.data);
      setPurchases(pR.data);
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
  };

  // ── CRUD ───────────────────────────────────────────────────
  const openNew  = (type = typeFilter) => {
    setCustomerEditData({ _newType: type });
    setCustomerModal(true);
  };
  const openEdit = (c) => { setCustomerEditData(c); setCustomerModal(true); setCustomerDetail(null); };
  const closeModal = () => { setCustomerModal(false); setCustomerEditData(null); };

  const save = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSaving(true);
    const label = form.type === "proveedor" ? "Proveedor" : "Cliente";
    try {
      if (customerEditData?.id) {
        await api.customers.update(customerEditData.id, form);
        notify(`${label} actualizado ✓`);
      } else {
        await api.customers.create(form);
        notify(`${label} registrado ✓`);
      }
      closeModal();
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
    finally { setSaving(false); }
  };

  const remove = async (id, type) => {
    const label = type === "proveedor" ? "proveedor" : "cliente";
    if (!confirm(`¿Eliminar este ${label}?`)) return;
    try {
      await api.customers.remove(id);
      notify(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
      loadCustomers();
    } catch (e) { notify(e.message, "err"); }
  };

  // ── Pago de fiado ──────────────────────────────────────────
  const openPay = (sale) => setPayModal(sale);

  const handleExportStatement = () => {
    const headers = ['Factura', 'Fecha', 'Estado', 'Cargo', 'Abonado', 'Saldo'];
    const rows = purchases.map(s => [
      s.id,
      new Date(s.created_at).toLocaleDateString("es-VE"),
      s.status.toUpperCase(),
      s.total,
      s.amount_paid,
      s.balance
    ]);
    exportToCSV(`Estado_Cuenta_${customerDetail.name.replace(/\s+/g, '_')}`, rows, headers);
  };

  const isProveedor = typeFilter === "proveedor";

  const renderActions = (c) => (
    <div className="flex gap-2">
      {!isProveedor && (
        <button onClick={() => openDetail(c)} className="p-2 rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all shadow-sm" title="Ver Detalle">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
        </button>
      )}
      <button onClick={() => openEdit(c)} className="p-2 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-white transition-all shadow-sm" title="Editar">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
      </button>
      <button onClick={() => remove(c.id, c.type)} className="p-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm" title="Eliminar">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  );

  const columns = isProveedor
    ? [
        { key: 'name', label: 'Nombre / Empresa', render: (c) => (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-violet-100 text-violet-600 dark:bg-violet-900/20">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-bold text-content dark:text-content-dark tracking-tight uppercase text-xs">{c.name}</span>
            </div>
        )},
        { key: 'phone', label: 'Teléfono', render: c => <span className="text-xs font-medium text-content-muted dark:text-content-dark-muted">{c.phone || "—"}</span> },
        { key: 'rif', label: 'RIF / Cédula', render: c => <span className="text-[10px] font-bold bg-surface-3 dark:bg-surface-dark px-2 py-1 rounded border border-border/50 dark:border-border-dark/50 text-content-muted">{c.rif || "S/N"}</span> },
        { key: 'tax_name', label: 'Razón Social', render: c => <span className="text-xs text-content dark:text-content-dark font-medium">{c.tax_name || "—"}</span> },
        { key: 'address', label: 'Dirección', render: c => <span className="text-[11px] text-content-muted dark:text-content-dark-muted max-w-[200px] truncate block" title={c.address}>{c.address || "—"}</span> },
        { key: 'actions', label: 'Acciones', render: renderActions }
      ]
    : [
        { key: 'name', label: 'Nombre del Cliente', render: (c) => (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-info/10 text-info dark:bg-blue-900/20">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-bold text-content dark:text-content-dark tracking-tight uppercase text-xs">{c.name}</span>
            </div>
        )},
        { key: 'phone', label: 'Teléfono', render: c => <span className="text-xs font-medium text-content-muted dark:text-content-dark-muted">{c.phone || "—"}</span> },
        { key: 'rif', label: 'RIF / Cédula', render: c => <span className="text-[10px] font-bold bg-surface-3 dark:bg-surface-dark px-2 py-1 rounded border border-border/50 dark:border-border-dark/50 text-content-muted">{c.rif || "S/N"}</span> },
        { key: 'total_purchases', label: 'Transac.', render: c => <span className="text-xs font-bold text-warning bg-warning/5 px-2 py-0.5 rounded-full border border-warning/10">{c.total_purchases}</span> },
        { key: 'total_spent', label: 'Cobrado', render: c => <span className="text-xs font-black text-success">{fmtPrice(c.total_spent)}</span> },
        { key: 'total_debt', label: 'Saldo Pendiente', render: c => parseFloat(c.total_debt || 0) > 0 ? <span className="font-black text-danger bg-danger/5 px-2 py-1 rounded-lg border border-danger/10 animate-pulse">{fmtPrice(c.total_debt)}</span> : <span className="text-content-subtle dark:text-content-dark-muted text-[10px] font-bold tracking-widest uppercase opacity-40">● Al día</span> },
        { key: 'actions', label: 'Acciones', render: renderActions }
      ];

  const pendingSales = purchases.filter(s => s.status === 'pendiente' || s.status === 'parcial');
  const paidSales    = purchases.filter(s => s.status === 'pagado');

  // ── Vista detalle ──────────────────────────────────────────
  if (customerDetail) return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="flex justify-between items-center mb-6 print-hidden">
        <button
          onClick={() => { setCustomerDetail(null); setPurchases([]); }}
          className="group flex items-center gap-2 text-warning font-bold text-xs uppercase tracking-widest hover:translate-x-[-4px] transition-all"
        >
          <span className="text-lg">←</span> Volver al listado
        </button>
        <div className="flex gap-2">
          <button onClick={handleExportStatement} className="px-4 py-2 bg-surface-2 dark:bg-surface-dark-3 rounded-lg text-xs font-black uppercase tracking-widest border border-border dark:border-border-dark flex items-center gap-2 hover:bg-surface-3 transition-colors">
            📥 CSV
          </button>
          <button onClick={() => window.print()} className="px-4 py-2 bg-info/10 text-info border border-info/20 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-info hover:text-white transition-colors">
            🖨️ PDF
          </button>
        </div>
      </div>

      {/* Encabezado visible SOLO en impresión */}
      <div className="hidden print-force-break mb-8 text-center text-black">
        <h1 className="text-2xl font-black uppercase">Estado de Cuenta</h1>
        <p className="text-sm mt-1 tracking-widest">{customerDetail.name} — RIF: {customerDetail.rif || 'S/N'}</p>
        <p className="text-xs mt-1 text-content-muted">Fecha de emisión: {new Date().toLocaleDateString("es-VE")}</p>
      </div>

      {/* Header cliente */}
      <div className="bg-white dark:bg-surface-dark-2 rounded-2xl shadow-card border border-border dark:border-border-dark p-6 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-info/10 text-info flex items-center justify-center text-2xl font-bold border border-info/20 shadow-sm">
              {customerDetail.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-black text-content dark:text-content-dark tracking-tight leading-tight uppercase">
                {customerDetail.name}
              </h2>
              <div className="flex flex-wrap gap-2.5 mt-2.5">
                {customerDetail.rif   && <span className="text-[10px] font-bold bg-surface-2 dark:bg-surface-dark px-2 py-0.5 rounded border border-border/50 dark:border-border-dark/50 text-content-muted">ID: {customerDetail.rif}</span>}
                {customerDetail.phone && <span className="text-[10px] font-bold bg-surface-2 dark:bg-surface-dark px-2 py-0.5 rounded border border-border/50 dark:border-border-dark/50 text-content-muted">📞 {customerDetail.phone}</span>}
                {customerDetail.email && <span className="text-[10px] font-bold bg-surface-2 dark:bg-surface-dark px-2 py-0.5 rounded border border-border/50 dark:border-border-dark/50 text-content-muted">✉ {customerDetail.email}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-6">
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-xl p-4 border border-border/30">
              <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted uppercase tracking-[2px] mb-1">TOTAL TRANSACCIONES</div>
              <div className="text-2xl font-black text-warning leading-none">{customerDetail.total_purchases}</div>
            </div>
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-xl p-4 border border-border/30">
              <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted uppercase tracking-[2px] mb-1">TOTAL FACTURADO</div>
              <div className="text-2xl font-black text-success leading-none">{fmtPrice(customerDetail.total_spent)}</div>
            </div>
          </div>

          <div className="lg:text-right bg-gradient-to-br from-white to-surface-2 dark:from-surface-dark-2 dark:to-surface-dark-3 rounded-2xl p-6 border-2 border-border dark:border-border-dark shadow-card-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-danger/5 rounded-full -mr-12 -mt-12 transition-all group-hover:bg-danger/10"></div>
            <div className="text-[11px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px] mb-2 relative z-10">SALDO PENDIENTE</div>
            {parseFloat(customerDetail.total_debt || 0) > 0
              ? <div className="text-4xl font-black text-danger drop-shadow-sm relative z-10">{fmtPrice(customerDetail.total_debt)}</div>
              : <div className="text-2xl font-black text-success flex items-center lg:justify-end gap-2 relative z-10">✓ SIN DEUDA</div>
            }
            {pendingSales.length > 0 && (
              <div className="text-[10px] font-bold text-danger/70 dark:text-danger/50 mt-2 uppercase tracking-wider relative z-10">
                {pendingSales.length} Factura{pendingSales.length > 1 ? "s" : ""} por cobrar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fiado activo */}
      {pendingSales.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-danger/20"></div>
            <h3 className="text-xs font-black text-danger uppercase tracking-[3px]">CUENTAS ABIERTAS</h3>
            <div className="h-px flex-1 bg-danger/20"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSales.map(sale => (
              <div key={sale.id} className="group bg-white dark:bg-surface-dark-2 border border-danger/20 hover:border-danger/40 transition-all rounded-2xl p-5 shadow-sm hover:shadow-card-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] font-bold text-content-subtle mb-1 tracking-widest uppercase">Factura #{sale.id}</div>
                    <div className="text-xs font-medium text-content-muted">
                      🕒 {new Date(sale.created_at).toLocaleDateString("es-VE", { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest border border-current ${
                    sale.status === 'parcial' ? "text-warning bg-warning/5" : "text-danger bg-danger/5"
                  }`}>
                    {sale.status === 'parcial' ? "PAGO PARCIAL" : "POR COBRAR"}
                  </div>
                </div>

                <div className="flex items-end gap-4 border-t border-border/40 pt-4">
                  <div className="flex-1">
                    <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest mb-1.5 line-clamp-1">
                      {sale.items?.map(i => i.name).join(", ") || "Sin items"}
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-[9px] text-content-subtle font-bold">CARGO</div>
                        <div className="text-xs font-bold text-content-muted">{fmtSale(sale, sale.total)}</div>
                      </div>
                      {sale.amount_paid > 0 && (
                        <div>
                          <div className="text-[9px] text-success font-bold">ABONADO</div>
                          <div className="text-xs font-bold text-success">{fmtSale(sale, sale.amount_paid)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-bold text-danger uppercase mb-1 tracking-widest">Saldo Restante</div>
                    <div className="text-xl font-black text-danger">{fmtSale(sale, sale.balance)}</div>
                  </div>
                </div>

                <button
                  onClick={() => openPay(sale)}
                  className="w-full mt-5 py-2.5 rounded-xl bg-success text-white text-[11px] font-black uppercase tracking-[2px] shadow-sm hover:bg-emerald-600 hover:shadow-success/30 transition-all"
                >
                  Registrar Cobro
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial pagado */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1 bg-border/40"></div>
        <h3 className="text-xs font-black text-content-subtle uppercase tracking-[3px]">HISTORIAL PAGADO</h3>
        <div className="h-px flex-1 bg-border/40"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {paidSales.length === 0
          ? <div className="col-span-full text-center text-content-subtle dark:text-content-dark-muted py-12 italic text-sm">Sin compras pagadas registradas</div>
          : paidSales.map(sale => (
            <div key={sale.id} className="bg-white dark:bg-surface-dark-3 border border-border dark:border-border-dark rounded-xl p-4 transition-all hover:bg-surface-2 dark:hover:bg-surface-dark group">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold text-content-subtle uppercase tracking-widest">Factura #{sale.id}</span>
                <span className="text-[8px] font-black text-success border border-success/40 px-1.5 py-0.5 rounded tracking-tighter uppercase">PAGADO</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-xs font-bold text-content-muted line-clamp-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  {sale.items?.map(i => i.name).join(", ") || "General"}
                </div>
                <div className="flex justify-between items-end mt-1">
                  <div className="text-[10px] font-medium text-content-muted">
                    {new Date(sale.created_at).toLocaleDateString("es-VE")}
                  </div>
                  <div className="text-sm font-black text-warning">
                    {fmtSale(sale, sale.total)}
                  </div>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* Modal pago unificado */}
      {payModal && (
        <PaymentFormModal
          sale={payModal}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); refreshDetail(); }}
        />
      )}

      <CustomerModal open={customerModal} onClose={closeModal} onSave={save} editData={customerEditData} loading={saving} />
    </div>
  );

  // ── Vista lista ────────────────────────────────────────────
  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex gap-4 items-center mb-8 flex-wrap">
        {/* Toggle Clientes / Proveedores */}
        <div className="flex bg-surface-2 dark:bg-surface-dark-3 rounded-xl p-1.5 shadow-inner border border-border/40 dark:border-border-dark/40 shrink-0">
          {[["cliente", "👤 Clientes"], ["proveedor", "🏭 Proveedores"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setTypeFilter(val); setCustomerSearch(""); }}
              className={[
                "px-6 py-2 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer border-none uppercase tracking-widest",
                typeFilter === val
                  ? val === "cliente"
                    ? "bg-info text-white shadow-md shadow-info/20"
                    : "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                  : "bg-transparent text-content-muted dark:text-content-dark-muted hover:text-content dark:hover:text-content-dark",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="relative flex-1 group">
          <input
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            placeholder={`Buscar ${isProveedor ? "proveedor" : "cliente"} por nombre, ID o teléfono...`}
            className="input-pos w-full pl-12 pr-4 py-3 bg-white dark:bg-surface-dark-2 rounded-xl border border-border dark:border-border-dark focus:ring-2 focus:ring-info/20 transition-all shadow-sm group-hover:shadow-md"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle group-focus-within:text-info transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>

        {/* Botón nuevo */}
        <button
          onClick={() => openNew(typeFilter)}
          className={`px-8 py-3 rounded-xl text-white font-black text-xs uppercase tracking-[2px] border-none shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 ${
            isProveedor 
              ? "bg-violet-600 hover:bg-violet-700 shadow-violet-600/30" 
              : "bg-info hover:bg-blue-600 shadow-info/30"
          }`}
        >
          + {isProveedor ? "Proveedor" : "Cliente"}
        </button>
      </div>

      <DataTable 
        columns={columns}
        data={customers}
        emptyMessage={`Sin ${isProveedor ? "proveedores" : "clientes"} registrados`}
        emptyIcon="📭"
        pagination={{
          page,
          limit: LIMIT,
          total: totalCustomers,
          onPageChange: setPage
        }}
      />

      <CustomerModal open={customerModal} onClose={closeModal} onSave={save} editData={customerEditData} loading={saving} />
    </div>
  );
}
