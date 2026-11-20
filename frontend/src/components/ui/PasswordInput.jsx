import { forwardRef, useState } from "react";

const OJO = "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z";
const OJO_TACHADO = "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21";
export const CANDADO = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

/**
 * Campo de contraseña con el ojito para verla, el mismo de la pantalla de entrada. `className`
 * es la del campo (INPUT de cada pantalla); los rellenos para los iconos los pone este.
 * `icono`: trazo SVG a la izquierda (p. ej. CANDADO), como en el acceso.
 */
const PasswordInput = forwardRef(function PasswordInput({ className = "", icono = null, ...props }, ref) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative group">
      {icono && (
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle group-focus-within:text-brand-500 transition-colors">
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icono} />
          </svg>
        </span>
      )}
      <input {...props} ref={ref} type={ver ? "text" : "password"} className={`${className} ${icono ? "pl-11" : ""} pr-11`} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white transition-colors"
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ver ? OJO_TACHADO : OJO} />
        </svg>
      </button>
    </div>
  );
});

export default PasswordInput;
