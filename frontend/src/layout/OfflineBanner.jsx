import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { useSinConexion, enviarAhora } from "../services/offline/sync";
import { reintentar } from "../services/offline/outbox";
import Modal from "../components/ui/Modal";
import StatusMark from "../components/ui/StatusMark";
import Money from "../components/ui/Money";
import { Button } from "../components/ui/Button";

// Franja de estado de la caja sin conexión, debajo de la barra superior.
//
// Aparece solo cuando hay algo que decir: se cayó internet (se puede seguir vendiendo), hay
// ventas hechas sin conexión esperando a enviarse, o el servidor rechazó alguna. "Ver ventas"
// abre la lista de lo vendido sin conexión con lo que pasó con cada una: qué factura le tocó,
// qué productos quedaron en negativo o por qué no se aceptó.
//
// También ofrece instalar la app en el equipo cuando el navegador lo permite: instalada, abre
// aunque no haya internet y el navegador no borra lo guardado.

const ESTADOS = {
  abierta:   { label: "Por enviar", tone: "warning" },
  lista:     { label: "Por enviar", tone: "warning" },
  enviada:   { label: "Registrada", tone: "success", quiet: "check" },
  rechazada: { label: "No registrada", tone: "danger" },
};

const hora = (iso) => {
  try { return new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

// Aviso de instalación. Chrome y Edge entregan el evento beforeinstallprompt; Safari no, y en
// el iPad se explica cómo añadirla a la pantalla de inicio.
const OMITIR = "nexus_instalar_omitido";
function useInstalacion() {
  const [evento, setEvento] = useState(null);
  const [omitido, setOmitido] = useState(() => { try { return localStorage.getItem(OMITIR) === "1"; } catch { return false; } });
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvento(e); };
    const onInstalled = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const instalada = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const omitir = () => { try { localStorage.setItem(OMITIR, "1"); } catch { /* modo privado */ } setOmitido(true); };
  const instalar = async () => {
    if (!evento) return;
    evento.prompt();
    try { await evento.userChoice; } catch { /* cerrado */ }
    setEvento(null);
  };
  return { mostrar: !instalada && !omitido && (!!evento || esIOS), puedeInstalar: !!evento, esIOS, instalar, omitir };
}

export default function OfflineBanner() {
  const { employee, baseCurrency, can } = useApp();
  const { offline, ventas, pendientes, rechazadas } = useSinConexion(employee?.company_id);
  const [abierta, setAbierta] = useState(false);
  const inst = useInstalacion();
  const sym = baseCurrency?.symbol || "Ref.";

  const hayVentas = ventas.length > 0;
  const mostrarEstado = offline || pendientes > 0 || rechazadas > 0;
  // Instalar solo se le ofrece a quien vende: es la caja la que tiene que abrir sin internet.
  const mostrarInstalar = !mostrarEstado && inst.mostrar && can("sales.create");

  const nVentas = (n) => (n === 1 ? "1 venta" : `${n} ventas`);
  let tono = "neutral";
  let texto;
  if (offline) {
    tono = "warning";
    texto = <>
      {/* "con el servidor" y no "sin internet": también sale cuando hay internet pero la base
          de datos no responde, y el cajero que ve el router encendido no lo entendería. */}
      <span className="font-semibold">Sin conexión con el servidor.</span> Puedes seguir vendiendo y cobrando
      {pendientes > 0 && <span className="text-amber-800/80 dark:text-amber-200/70"> · {nVentas(pendientes)} por enviar</span>}
    </>;
  } else if (rechazadas > 0) {
    tono = "danger";
    texto = <><span className="font-semibold">{nVentas(rechazadas)} sin conexión no {rechazadas === 1 ? "se pudo" : "se pudieron"} registrar.</span> Revísalas antes de cerrar la caja</>;
  } else if (pendientes > 0) {
    texto = <>Volvió la conexión · enviando {nVentas(pendientes)} hechas sin conexión</>;
  }

  const estilos = {
    warning: { caja: "bg-amber-50 dark:bg-amber-500/10 border-amber-200/80 dark:border-amber-500/20", punto: "bg-amber-500", texto: "text-amber-900 dark:text-amber-200" },
    danger:  { caja: "bg-red-50 dark:bg-red-500/10 border-red-200/80 dark:border-red-500/20", punto: "bg-red-500", texto: "text-red-900 dark:text-red-200" },
    neutral: { caja: "bg-white dark:bg-white/[0.03] border-border/60 dark:border-white/[0.06]", punto: "bg-content-subtle", texto: "text-content dark:text-white" },
  }[tono];

  return (
    <>
      {mostrarEstado && (
        <div role="status" className={`shrink-0 border-b ${estilos.caja}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${estilos.punto}`} />
            <p className={`flex-1 min-w-[200px] text-[13px] leading-snug ${estilos.texto}`}>{texto}</p>
            {hayVentas && (
              <button onClick={() => setAbierta(true)} className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium shrink-0">
                Ver ventas
              </button>
            )}
          </div>
        </div>
      )}

      {mostrarInstalar && (
        <div className="shrink-0 border-b bg-white dark:bg-white/[0.03] border-border/60 dark:border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2">
            <svg className="w-4 h-4 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <p className="flex-1 min-w-[200px] text-[13px] leading-snug text-content dark:text-white">
              {inst.puedeInstalar
                ? "Instala NXUS en este equipo para que la caja abra aunque se caiga internet."
                : <>Para que la caja abra sin internet, añádela a la pantalla de inicio: botón <span className="font-semibold">Compartir</span> y luego <span className="font-semibold">Añadir a pantalla de inicio</span>.</>}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={inst.omitir} className="h-8 px-2 text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                Ahora no
              </button>
              {inst.puedeInstalar && (
                <button onClick={inst.instalar} className="btn-accent h-8 px-3 rounded-lg text-[12px] font-semibold">
                  Instalar en este equipo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={abierta}
        onClose={() => setAbierta(false)}
        title="Ventas sin conexión"
        width={520}
        footer={!offline && pendientes > 0 ? (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => enviarAhora()} className="h-12 sm:h-10">Enviar ahora</Button>
          </div>
        ) : null}
      >
        <p className="text-[12px] text-content-subtle mb-3">
          {offline
            ? "Se guardan en este equipo y se envían solas al volver la conexión. La factura se emite al llegar."
            : "Las registradas se guardan aquí unos días, con la factura que le tocó a cada una."}
        </p>
        <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
          {[...ventas].reverse().map((v) => {
            const total = parseFloat(v.receipt?.total || 0);
            const r = v.result || {};
            return (
              <div key={v.key} className={`px-4 py-3 ${v.status === "rechazada" ? "border-l-[3px] border-l-red-500" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">
                    {r.invoice_number || v.ref}
                    {r.invoice_number && <span className="ml-2 text-[12px] font-normal text-content-subtle">{v.ref}</span>}
                  </span>
                  <Money value={`${sym} ${total.toFixed(2)}`} className="text-[13px] font-semibold text-content dark:text-white" />
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-content-subtle truncate">
                    {hora(v.sold_at)}{v.receipt?.customer_name ? ` · ${v.receipt.customer_name}` : ""}
                  </span>
                  <StatusMark status={v.status} map={ESTADOS} />
                </div>
                {v.status === "rechazada" && (
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <p className="text-[12px] text-red-700 dark:text-red-300 leading-snug">{v.error}</p>
                    <button onClick={() => reintentar(v.key)} className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium shrink-0">
                      Reintentar
                    </button>
                  </div>
                )}
                {r.cobro_error && (
                  <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                    La venta entró, pero el cobro no: {r.cobro_error}. Cóbrala desde Pendientes.
                  </p>
                )}
                {r.stock_negativo?.length > 0 && (
                  <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                    Quedó en negativo: {r.stock_negativo.join(", ")}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
