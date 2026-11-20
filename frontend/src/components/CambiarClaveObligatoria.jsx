import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { recordarAcceso } from "../services/offline/session";
import { useApp } from "../context/AppContext";
import { Button } from "./ui/Button";
import PasswordInput, { CANDADO } from "./ui/PasswordInput";
import ReglasClave from "./ui/ReglasClave";
import { NxusLogo } from "./ui/NxusLogo";
import { claveCumple, fuerzaClave } from "../helpers/passwordPolicy";
import { toNameCase } from "../helpers";

// Mismo campo que el acceso (LoginScreen): esta pantalla es su continuación.
const INPUT = "w-full h-11 rounded-xl border border-border dark:border-white/15 bg-white dark:bg-white/[0.04] text-[15px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-colors";
const LABEL = "block text-[13px] font-medium text-content-muted dark:text-white/70 mb-1.5";

const ESCUDO = "M12 9v3.75m0 3.75h.008M9.75 3.104 4.5 5.25v5.4c0 4.302 3.06 8.32 7.5 9.35 4.44-1.03 7.5-5.048 7.5-9.35v-5.4L14.25 3.104a6.002 6.002 0 0 0-4.5 0Z";
const CIFRADO = "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z";

const FUERZA = [
  null,
  { texto: "Débil", color: "bg-red-500", tinta: "text-red-600 dark:text-red-400" },
  { texto: "Débil", color: "bg-red-500", tinta: "text-red-600 dark:text-red-400" },
  { texto: "Buena", color: "bg-emerald-500", tinta: "text-emerald-600 dark:text-emerald-400" },
  { texto: "Muy buena", color: "bg-emerald-500", tinta: "text-emerald-600 dark:text-emerald-400" },
];

const conTecladoFisico = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/**
 * Paso obligatorio después de entrar con una contraseña que no cumple la regla (8+ caracteres,
 * letra y número; ver helpers/passwordPolicy.js). Va EN LUGAR de la app, no encima: mientras la
 * marca esté puesta el servidor rechaza todo lo demás (middleware/auth.js), y la app montada
 * detrás solo dispararía peticiones que rebotan. No se cierra: o se cambia, o se sale.
 *
 * Sigue el lenguaje del acceso (LoginScreen): fondo de la marca, tarjeta redondeada y, en el
 * teléfono, hoja que sube desde abajo.
 */
export default function CambiarClaveObligatoria() {
  const { employee, logout, marcarClaveCambiada, notify } = useApp();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState(null);
  const actualRef = useRef(null);

  // En el teléfono no se enfoca nada solo: subir el teclado sin que lo pidan tapa la alerta.
  useEffect(() => { if (conTecladoFisico()) actualRef.current?.focus(); }, []);

  const coinciden = nueva.length > 0 && nueva === repetir;
  const lista = claveCumple(nueva, employee?.username) && coinciden && actual.length > 0;
  const fuerza = fuerzaClave(nueva, employee?.username);
  const nombre = employee?.full_name ? toNameCase(employee.full_name.split(" ")[0]) : null;

  const guardar = async () => {
    if (!lista) return;
    setError(null);
    try {
      const r = await api.auth.changePassword({ current_password: actual, new_password: nueva });
      // El acceso sin conexión de este equipo se guarda con la contraseña nueva (y reemplaza al
      // de la vieja, que si no seguiría abriendo la caja sin internet).
      await recordarAcceso(employee?.username, nueva, { employee: { ...employee, must_change_password: false }, token: r?.token, refresh_token: r?.refresh_token });
      notify("Listo, tu contraseña nueva ya está activa");
      marcarClaveCambiada();
    } catch (e) {
      setError(e.message || "No se pudo cambiar la contraseña");
    }
  };
  const alEnter = (e) => { if (e.key === "Enter") guardar(); };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surface-2 dark:bg-surface-dark text-content dark:text-white">
      {/* Fondo de la marca, el mismo del acceso: rejilla tenue y dos halos. */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none
        bg-[linear-gradient(to_right,rgb(0_0_0/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.045)_1px,transparent_1px)]
        dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)]
        bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div aria-hidden="true" className="fixed -top-40 -left-32 w-[560px] h-[560px] rounded-full bg-brand-500/20 dark:bg-brand-500/25 blur-[120px] pointer-events-none" />
      <div aria-hidden="true" className="fixed top-20 -right-40 w-[480px] h-[480px] rounded-full bg-brand-200/40 dark:bg-brand-400/10 blur-[120px] pointer-events-none" />

      <div className="relative min-h-full flex flex-col items-center justify-end sm:justify-center sm:px-4 sm:py-10">
        <NxusLogo className="hidden sm:block h-8 w-auto mb-6 text-content dark:text-white" />

        <main
          role="dialog" aria-modal="true" aria-labelledby="titulo-clave"
          className="relative w-full sm:max-w-[440px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface-dark-2 border-t sm:border border-border/70 dark:border-white/10 shadow-2xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8 modal-in"
        >
          <span className="w-12 h-12 rounded-2xl bg-amber-500/[0.12] text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ESCUDO} /></svg>
          </span>
          <h1 id="titulo-clave" className="mt-4 text-[22px] font-bold tracking-tight text-content dark:text-white">
            Protege tu cuenta
          </h1>
          <p className="mt-1 text-[14px] text-content-subtle">
            {nombre ? `${nombre}, antes` : "Antes"} de seguir necesitas una contraseña nueva.
          </p>

          {/* La alerta: qué pasó y por qué no se puede saltar. */}
          <div role="alert" className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3.5">
            <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">
              Detectamos que tu contraseña puede ser robada
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              Es corta o muy fácil de adivinar. Por tu seguridad y la de tu negocio, NXUS te pide
              cambiarla ahora.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="clave-actual" className={LABEL}>Contraseña actual</label>
              <PasswordInput id="clave-actual" ref={actualRef} icono={CANDADO} value={actual} onChange={(e) => setActual(e.target.value)}
                onKeyDown={alEnter} autoComplete="current-password" placeholder="La que usaste para entrar" className={INPUT} />
            </div>
            <div>
              <label htmlFor="clave-nueva" className={LABEL}>Contraseña nueva</label>
              <PasswordInput id="clave-nueva" icono={CANDADO} value={nueva} onChange={(e) => setNueva(e.target.value)}
                onKeyDown={alEnter} autoComplete="new-password" placeholder="Ej. Caja2026" className={INPUT} />
              {fuerza > 0 && (
                <div className="mt-2 flex items-center gap-3" aria-live="polite">
                  <div className="flex-1 grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={`h-1.5 rounded-full transition-colors ${i <= fuerza ? FUERZA[fuerza].color : "bg-border dark:bg-white/10"}`} />
                    ))}
                  </div>
                  <span className={`text-[12px] font-semibold w-16 text-right ${FUERZA[fuerza].tinta}`}>{FUERZA[fuerza].texto}</span>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="clave-repetir" className={LABEL}>Repite la contraseña nueva</label>
              <PasswordInput id="clave-repetir" icono={CANDADO} value={repetir} onChange={(e) => setRepetir(e.target.value)}
                onKeyDown={alEnter} autoComplete="new-password" className={INPUT} />
            </div>

            <ReglasClave
              password={nueva}
              username={employee?.username}
              extra={[{ id: "coinciden", label: "Las dos coinciden", ok: coinciden }]}
            />

            {error && (
              <p role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-[13px] font-medium">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                {error}
              </p>
            )}
          </div>

          <Button onClick={guardar} disabled={!lista} className="mt-6 w-full h-12 rounded-xl">
            Guardar y continuar
          </Button>
          <button type="button" onClick={logout}
            className="mt-2 w-full h-11 text-[14px] text-content-subtle hover:text-content dark:hover:text-white transition-colors">
            Cerrar sesión
          </button>

          <p className="mt-3 pt-4 border-t border-border/60 dark:border-white/[0.06] flex items-center justify-center gap-1.5 text-[12px] text-content-subtle">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={CIFRADO} /></svg>
            Se guarda cifrada: nadie en NXUS puede verla.
          </p>
        </main>
      </div>
    </div>
  );
}
