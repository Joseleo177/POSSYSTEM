import { reglasClave } from "../../helpers/passwordPolicy";

const CHECK = "M5 13l4 4L19 7";
const PUNTO = "M12 12h.01";

/**
 * Lista en vivo de lo que le falta a una contraseña. Gris lo pendiente y verde con check lo que
 * ya cumple (color = señal: el verde va solo con check). `extra`: reglas propias de la pantalla,
 * como "Las dos coinciden".
 */
export default function ReglasClave({ password, username, extra = [], className = "" }) {
  const reglas = [...reglasClave(password, username), ...extra];
  return (
    <ul className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ${className}`} aria-live="polite">
      {reglas.map((r) => (
        <li key={r.id} className={`flex items-center gap-1.5 text-[12px] ${r.ok ? "text-success" : "text-content-subtle"}`}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={r.ok ? 2.5 : 4} d={r.ok ? CHECK : PUNTO} />
          </svg>
          {r.label}
        </li>
      ))}
    </ul>
  );
}
