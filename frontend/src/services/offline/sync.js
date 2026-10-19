import { useEffect, useState } from "react";
import { api } from "../api";
import { isOffline, onNetworkChange, esSinServidor } from "./network";
import {
  onOutboxChange, avisarCambio, ventasDeEmpresa, listaParaEnviar, porEnviar, limpiarEnviadas, outboxPut,
} from "./outbox";

// Envía al servidor las ventas que la caja hizo sin conexión, en el orden en que se hicieron.
//
// Corre en el propio navegador mientras la app está abierta. No se usa el "background sync"
// del service worker: Safari no lo tiene y en una caja la app está siempre a la vista, así que
// no hace falta.
//
// Cada pocos segundos:
//   - sin conexión, pregunta al servidor si ya volvió (/api/ping, sin tocar la base);
//   - con conexión y ventas por enviar, las envía.
// Además se dispara en cuanto vuelve la red y cada vez que se guarda una venta nueva.
//
// Solo envía las ventas de la empresa con la que se inició sesión: si en el equipo entra
// alguien de otra empresa, las de la primera esperan a que vuelva a entrar alguien de ella.

const CADA_MS = 15_000;
const REINTENTO_MS = 60_000;

let empresaActual = null;
let enviando = false;
let timer = null;

async function enviarPendientes() {
  if (enviando || isOffline() || !empresaActual) return;
  enviando = true;
  try {
    // Una venta que el servidor no pudo procesar (un 500) espera un minuto antes de volver a
    // intentarse: sin esa pausa, el propio aviso de "cambió la bandeja" la reenviaba sin fin.
    const ventas = (await ventasDeEmpresa(empresaActual))
      .filter(listaParaEnviar)
      .filter((e) => !e.ultimo_fallo_ms || Date.now() - e.ultimo_fallo_ms > REINTENTO_MS);
    for (const e of ventas) {
      try {
        const r = await api.sales.syncOffline({
          idempotency_key: e.key,
          sold_at: e.sold_at,
          offline_ref: e.ref,
          employee_id: e.employee_id,
          warehouse_id: e.warehouse_id,
          ...e.sale,
          payments: e.payments || [],
        });
        const d = r?.data || {};
        await outboxPut({
          ...e,
          status: "enviada",
          sent_ms: Date.now(),
          error: null,
          result: {
            sale_id: d.sale?.id ?? null,
            invoice_number: d.sale?.invoice_number ?? null,
            status: d.sale?.status ?? null,
            stock_negativo: d.stock_negativo || [],
            cobro_error: d.cobro_error || null,
          },
        });
      } catch (err) {
        // Se cayó la conexión a mitad: se deja todo como está y se sigue en la próxima vuelta.
        // Sin internet, sin base o con la respuesta cortada: todo queda como está para la próxima.
        if (esSinServidor(err) || err.code === "BAD_RESPONSE" || err.code === "TIMEOUT") break;
        // Un rechazo del servidor (dato que no acepta, permiso) no cambia por insistir: la
        // venta pasa a la bandeja para que alguien la mire. Un 500 sí se reintenta.
        const definitivo = err.data?.retry === false || (err.status >= 400 && err.status < 500);
        await outboxPut({
          ...e,
          status: definitivo ? "rechazada" : e.status,
          error: err.message,
          intentos: (e.intentos || 0) + 1,
          ultimo_fallo_ms: Date.now(),
        });
      }
      avisarCambio();
    }
    limpiarEnviadas().catch(() => {});
  } finally {
    enviando = false;
  }
}

async function vuelta() {
  if (isOffline()) {
    try { await api.ping(); } catch { return; } // sigue sin conexión
  }
  await enviarPendientes();
}

export function iniciarSincronizacion(companyId) {
  empresaActual = companyId ?? null;
  if (timer || !empresaActual) return;
  timer = setInterval(() => { if (document.visibilityState === "visible" || isOffline()) vuelta(); }, CADA_MS);
  onNetworkChange((sin) => { if (!sin) enviarPendientes(); });
  onOutboxChange(() => { setTimeout(enviarPendientes, 300); });
  window.addEventListener("online", () => vuelta());
  vuelta();
}

export const enviarAhora = () => vuelta();

// Estado para la pantalla: si hay conexión y qué ventas esperan.
export function useSinConexion(companyId) {
  const [offline, setOffline] = useState(isOffline());
  const [ventas, setVentas] = useState([]);

  useEffect(() => onNetworkChange(setOffline), []);
  useEffect(() => {
    if (!companyId) return undefined;
    let vivo = true;
    const cargar = () => ventasDeEmpresa(companyId).then((v) => { if (vivo) setVentas(v); });
    cargar();
    const off = onOutboxChange(cargar);
    return () => { vivo = false; off(); };
  }, [companyId]);

  return {
    offline,
    ventas,
    pendientes: ventas.filter(porEnviar).length,
    rechazadas: ventas.filter((v) => v.status === "rechazada").length,
  };
}
