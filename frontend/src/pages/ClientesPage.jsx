import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useCustomers } from "../hooks/useCustomers";
import { fmtBase, fmtSale as fmtSaleHelper } from "../helpers";
import { exportToCSV } from "../utils/exportUtils";
import DataTable from "../components/DataTable";
import CustomerModal from "../components/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";
import ConfirmModal from "../components/ConfirmModal";

export default function ContactosPage() {
  const { notify, baseCurrency } = useApp();

  const {
    customers, total, page, setPage,
    search, setSearch,
    typeFilter, setTypeFilter,
    detail, detailSales,
    openDetail, closeDetail, refreshDetail,
    saving, save: saveAction, remove: removeAction,
    LIMIT
  } = useCustomers(notify);

  const fmtPrice = (n) => fmtBase(n, baseCurrency);
  const fmtSale = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

  // ── UI State (Modals) ──────────────────────────────────────
  const [customerModal, setCustomerModal] = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── CRUD Wrappers ──────────────────────────────────────────
  const openNew = (type = typeFilter) => {
    setCustomerEditData({ _newType: type });
    setCustomerModal(true);
  };
  const openEdit = (c) => {
    setCustomerEditData(c);
    setCustomerModal(true);
    closeDetail();
  };
  const closeModal = () => {
    setCustomerModal(false);
    setCustomerEditData(null);
  };

  const onSave = async (form) => {
    const ok = await saveAction(form, customerEditData?.id);
    if (ok) closeModal();
  };

  // ── Pago de fiado ──────────────────────────────────────────
  const openPay = (sale) => setPayModal(sale);

  const handleExportStatement = () => {
    const headers = ['Factura', 'Fecha', 'Estado', 'Cargo', 'Abonado', 'Saldo'];
    const rows = detailSales.map(s => [
      s.id,
      new Date(s.created_at).toLocaleDateString("es-VE"),
      s.status.toUpperCase(),
      s.total,
      s.amount_paid,
      s.balance
    ]);
    exportToCSV(`Estado_Cuenta_${detail.name.replace(/\s+/g, '_')}`, rows, headers);
  };

  const renderActions = (c) => (
    <div className="flex gap-2.5">
      {c.type === "cliente" && (
        <button onClick={() => openDetail(c)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all shadow-sm active:scale-95" title="Ver Detalle">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        </button>
      )}
      <button onClick={() => openEdit(c)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-white transition-all shadow-sm active:scale-95" title="Editar">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </button>
      <button onClick={() => setDeleteConfirm(c)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm active:scale-95" title="Eliminar">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  );

  const columns = [
    {
      key: 'type', label: 'Tipo', render: (c) => (
        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-inner ${c.type === "proveedor"
          ? "bg-violet-500/10 text-violet-500 border-violet-500/20"
          : "bg-info/10 text-info border-info/20"
          }`}>
          {c.type === "proveedor" ? "Proveedor" : "Cliente"}
        </span>
      )
    },
    {
      key: 'name', label: 'Nombre / Empresa', render: (c) => (
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black shadow-inner border border-white/10 ${c.type === "proveedor"
            ? "bg-violet-500/10 text-violet-500"
            : "bg-brand-500/10 text-brand-500"
            }`}>
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-content dark:text-content-dark tracking-tight uppercase text-xs leading-none mb-1">{c.name}</span>
            <span className="text-[9px] font-bold text-content-subtle opacity-50 uppercase tracking-widest leading-none">ID: {c.code || c.id}</span>
          </div>
        </div>
      )
    },
    { key: 'phone', label: 'Teléfono', render: c => <span className="text-xs font-medium text-content-muted dark:text-content-dark-muted">{c.phone || "—"}</span> },
    { key: 'rif', label: 'RIF / Cédula', render: c => <span className="text-[10px] font-black bg-surface-3 dark:bg-white/5 px-2.5 py-1.5 rounded-xl border border-border/40 dark:border-white/5 text-content-subtle tracking-wider shadow-inner">{c.rif || "S/N"}</span> },
    {
      key: 'balance',
      label: 'Balance / Estado',
      render: (c) => {
        if (c.type === "proveedor") {
          return <span className="text-[11px] text-content-muted dark:text-content-dark-muted italic">{c.tax_name || "—"}</span>;
        }
        const debt = parseFloat(c.total_debt || 0);
        return debt > 0
          ? <span className="font-black text-danger bg-danger/10 px-3 py-1.5 rounded-xl border border-danger/20 text-xs shadow-sm tabular-nums">-{fmtPrice(debt)}</span>
          : <span className="flex items-center gap-2 text-[9px] font-black tracking-[2px] uppercase text-success opacity-80">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Al día
            </span>;
      }
    },
    { key: 'actions', label: 'Acciones', render: renderActions }
  ];

  const pendingSales = detailSales.filter(s => s.status === 'pendiente' || s.status === 'parcial');
  const paidSales = detailSales.filter(s => s.status === 'pagado');

  const listView = (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex gap-4 items-center mb-4 flex-wrap">
        <div className="relative flex-1 group">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contacto por nombre, ID o teléfono..."
            className="input pr-4 pl-12 h-10 !rounded-2xl shadow-sm group-hover:shadow-md transition-all"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-content-subtle group-focus-within:text-brand-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        <button
          onClick={() => openNew("cliente")}
          className="btn-primary h-10 px-5 !rounded-2xl text-[11px] font-black uppercase tracking-[2px]"
        >
          + Nuevo Contacto
        </button>
      </div>

      <div className="card-premium">
        <DataTable
          columns={columns}
          data={customers}
          emptyMessage="Sin contactos registrados"
          emptyIcon=""
          pagination={{
            page,
            limit: LIMIT,
            total: total,
            onPageChange: setPage
          }}
        />
      </div>
    </div>
  );

  const detailView = detail && (
    <div className="animate-in fade-in slide-in-from-left-6 duration-500">
      <div className="flex justify-between items-center mb-4 print-hidden">
        <button
          onClick={closeDetail}
          className="group flex items-center gap-2 text-content-muted font-bold text-xs uppercase tracking-[2px] hover:text-brand-500 transition-all active:scale-95"
        >
          <span className="text-lg group-hover:-translate-x-1 transition-transform">←</span> Volver al listado
        </button>
        <div className="flex gap-3">
          <button onClick={handleExportStatement} className="btn-secondary px-5 py-2.5 !rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            CSV
          </button>
          <button onClick={() => window.print()} className="btn-primary bg-info shadow-info/20 hover:bg-info/90 px-5 py-2.5 !rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            Imprimir
          </button>
        </div>
      </div>

      <div className="hidden print-force-break mb-4 text-center text-black">
        <h1 className="text-3xl font-black uppercase font-display tracking-tight">Estado de Cuenta</h1>
        <p className="text-sm mt-2 tracking-[3px] font-bold opacity-70">{detail.name} — RIF: {detail.rif || 'S/N'}</p>
        <div className="w-16 h-1 bg-black mx-auto my-4"></div>
        <p className="text-[10px] uppercase font-black tracking-widest opacity-50">Fecha de emisión: {new Date().toLocaleDateString("es-VE")}</p>
      </div>

      <div className="card-premium p-4 mb-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center relative z-10">
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-black shadow-lg border-4 border-white dark:border-surface-dark-2 ${detail.type === "proveedor"
              ? "bg-violet-500/10 text-violet-500 border-violet-500/20"
              : "bg-info/10 text-info border-info/20"
              }`}>
              {detail.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-3xl font-black text-content dark:text-content-dark tracking-tight uppercase font-display leading-none mb-3">
                {detail.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {detail.rif && <span className="text-[9px] font-black bg-surface-2 dark:bg-surface-dark-3 px-2.5 py-1 rounded-lg border border-border/50 dark:border-border-dark/50 text-content-muted uppercase tracking-wider">RIF: {detail.rif}</span>}
                {detail.phone && <span className="text-[9px] font-black bg-surface-2 dark:bg-surface-dark-3 px-2.5 py-1 rounded-lg border border-border/50 dark:border-border-dark/50 text-content-muted uppercase tracking-wider flex items-center gap-1.5"><svg className="w-3 h-3 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> {detail.phone}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <div className="bg-surface-2/50 dark:bg-surface-dark-3/50 rounded-2xl p-4 border border-border/40">
              <div className="text-[9px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px] mb-1">Transacciones</div>
              <div className="text-2xl font-black text-warning font-display">{detail.total_purchases}</div>
            </div>
            <div className="bg-surface-2/50 dark:bg-surface-dark-3/50 rounded-2xl p-4 border border-border/40">
              <div className="text-[9px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px] mb-1">Facturación Total</div>
              <div className="text-2xl font-black text-success font-display">{fmtPrice(detail.total_spent)}</div>
            </div>
          </div>

          <div className="lg:text-right bg-gradient-to-br from-white to-surface-2 dark:from-surface-dark-2 dark:to-surface-dark-3 rounded-2xl p-4 border border-brand-500/20 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-full h-full bg-brand-500/5 transition-all group-hover:bg-brand-500/10"></div>
            <div className="text-[11px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[4px] mb-3 relative z-10">SALDO PENDIENTE</div>
            {parseFloat(detail.total_debt || 0) > 0
              ? <div className="text-5xl font-black text-danger drop-shadow-sm relative z-10 font-display tracking-tight">{fmtPrice(detail.total_debt)}</div>
              : <div className="text-3xl font-black text-success flex items-center lg:justify-end gap-3 relative z-10 font-display">
                <span className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </span>
                SALDO AL DÍA
              </div>
            }
            {pendingSales.length > 0 && (
              <div className="text-[10px] font-black text-danger/60 mt-3 uppercase tracking-[2px] relative z-10">
                {pendingSales.length} COMPROBANTE{pendingSales.length > 1 ? "S" : ""} EN MORA
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingSales.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-4 mb-3">
            <h3 className="text-[11px] font-black text-danger uppercase tracking-[5px] whitespace-nowrap">Cuentas por Cobrar</h3>
            <div className="h-0.5 flex-1 bg-danger/10 rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSales.map(sale => (
              <div key={sale.id} className="group bg-white dark:bg-surface-dark-2 border border-border/60 hover:border-danger/30 transition-all rounded-2xl p-4 shadow-sm hover:shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-danger/5 rounded-full -mr-16 -mt-16 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div>
                    <div className="text-[10px] font-black text-content-subtle mb-1 tracking-[2px] uppercase opacity-60">ID Factura #{sale.id}</div>
                    <div className="text-xs font-bold text-content-muted flex items-center gap-2">
                      <span className="text-danger">●</span> {new Date(sale.created_at).toLocaleDateString("es-VE", { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div className={`badge ${sale.status === 'parcial' ? "badge-warning" : "badge-danger"
                    } !text-[9px] !px-3 !py-1.5`}>
                    {sale.status === 'parcial' ? "PAGO PARCIAL" : "POR COBRAR"}
                  </div>
                </div>

                <div className="flex items-end gap-6 border-t border-border/40 pt-6 relative z-10">
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-content-subtle uppercase tracking-widest mb-3 line-clamp-1 opacity-50">
                      {sale.items?.map(i => i.name).join(", ") || "Concepto no especificado"}
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <div className="text-[9px] text-content-subtle font-black uppercase tracking-wider mb-0.5">CARGO</div>
                        <div className="text-sm font-bold text-content-muted">{fmtSale(sale, sale.total)}</div>
                      </div>
                      {sale.amount_paid > 0 && (
                        <div>
                          <div className="text-[9px] text-success font-black uppercase tracking-wider mb-0.5">ABONADO</div>
                          <div className="text-sm font-bold text-success">{fmtSale(sale, sale.amount_paid)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] font-black text-danger uppercase mb-1 tracking-[2px]">Saldo</div>
                    <div className="text-2xl font-black text-danger font-display">{fmtSale(sale, sale.balance)}</div>
                  </div>
                </div>

                <button
                  onClick={() => openPay(sale)}
                  className="btn-success w-full mt-3 h-12 !rounded-xl text-[11px] font-black uppercase tracking-[3px] active:scale-95"
                >
                  Registrar Cobro
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-[11px] font-black text-content-subtle uppercase tracking-[5px] whitespace-nowrap opacity-60">Historial de Pagos</h3>
        <div className="h-0.5 flex-1 bg-border/40 rounded-full"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paidSales.length === 0
          ? <div className="col-span-full text-center text-content-subtle/50 dark:text-content-dark-muted/30 py-16 italic text-sm font-medium">No se registran pagos finalizados</div>
          : paidSales.map(sale => (
            <div key={sale.id} className="bg-white dark:bg-surface-dark-3 border border-border/50 dark:border-border-dark/50 rounded-2xl p-5 transition-all hover:bg-surface-2 dark:hover:bg-surface-dark group hover:shadow-md">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[9px] font-black text-content-subtle/60 uppercase tracking-widest">#{sale.id}</span>
                <span className="badge-success !text-[8px] !px-2 !py-0.5 !rounded-lg">PAGADO</span>
              </div>
              <div className="flex flex-col gap-3">
                <div className="text-xs font-bold text-content-muted line-clamp-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  {sale.items?.map(i => i.name).join(", ") || "Venta General"}
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-[10px] font-semibold text-content-subtle/80 italic">
                    {new Date(sale.created_at).toLocaleDateString("es-VE")}
                  </div>
                  <div className="text-base font-black text-success font-display">
                    {fmtSale(sale, sale.total)}
                  </div>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {payModal && (
        <PaymentFormModal
          sale={payModal}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); refreshDetail(); }}
        />
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-700 max-w-[1600px] mx-auto p-2 lg:p-4">
      {!detail && listView}
      {detail && detailView}

      <CustomerModal open={customerModal} onClose={closeModal} onSave={onSave} editData={customerEditData} loading={saving} />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={`¿Eliminar ${deleteConfirm?.type === "proveedor" ? "proveedor" : "cliente"}?`}
        message={`Estás a punto de eliminar a "${deleteConfirm?.name}". Esta acción no se puede deshacer.`}
        onConfirm={async () => {
          await removeAction(deleteConfirm.id, deleteConfirm.type);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, Eliminar Permanentemente"
        cancelText="No, Mantener"
      />
    </div>
  );
}
