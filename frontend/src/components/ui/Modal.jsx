import { useEffect, useRef } from "react";
import { hasTopOverlay } from "../../helpers/overlayGuard";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Escritorio: hay teclado físico, el foco automático ahorra un clic y el Tab tiene sentido.
// Teléfono: un focus() de más sube o baja el teclado sin que nadie lo pida y desplaza el modal,
// así que ahí solo se enfoca el campo que el modal marque expresamente (data-autofocus).
const conTecladoFisico = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export default function Modal({ open, onClose, title, children, width = 560 }) {
  const modalRef = useRef(null);
  const previousFocus = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement;

    // Auto-focus: respetar el elegido por el modal, si no el primer interactivo.
    //
    // `data-autofocus` y no `autoFocus`: React no refleja esa prop como atributo en el DOM al
    // renderizar en el cliente, así que un querySelector('[autofocus]') nunca la encuentra.
    // Sin ella, el primer interactivo es la X de cerrar, y un modal que quiere el foco en su
    // campo terminaba con DOS focus() seguidos —la X y luego el campo—. En el Safari del
    // iPhone ese ida y vuelta cierra el teclado y vuelve a pedirlo, y a la segunda apertura
    // Safari ya no lo abre: el campo queda enfocado pero sin teclado.
    const frame = requestAnimationFrame(() => {
      if (!modalRef.current) return;
      const auto = modalRef.current.querySelector('[data-autofocus],[autofocus]');
      // En el teléfono, si el modal no dice qué enfocar, no se enfoca nada: el primer
      // interactivo suele ser la X de cerrar, y enfocarla solo sirve para bajar el teclado
      // que el modal anterior había dejado abierto.
      const first = auto || (conTecladoFisico() ? modalRef.current.querySelector(FOCUSABLE) : null);
      if (first) first.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      // Devolver foco SOLO en la transición abierto→cerrado.
      // (El efecto también se re-ejecuta cuando cambia la identidad de onClose en cada
      // render del padre; sin esta guarda, robaba el foco de otros inputs de la página.)
      if (wasOpen.current) {
        wasOpen.current = false;
        // Devolver el foco es cortesía para quien navega con teclado. En un teléfono es lo
        // contrario: reenfoca el buscador que había detrás, sube el teclado solo y deja al
        // siguiente modal peleando contra él.
        if (conTecladoFisico()) previousFocus.current?.focus();
        previousFocus.current = null;
      }
      return;
    }
    wasOpen.current = true;

    const handleKey = (e) => {
      if (e.key === "Escape") {
        // Con una botonera de cobro (u otro overlay) por encima, es ella la que maneja
        // Escape: retrocede un paso o se cierra, sin tumbar este Modal.
        if (hasTopOverlay()) return;
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKey, true); // capture phase — intercepta antes que el fondo
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-5 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        style={{ maxWidth: width }}
        className="bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl w-full relative animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/20 dark:border-white/[0.06]">
          <h2 className="text-[11px] font-black tracking-widest uppercase text-content-subtle dark:text-white/40">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-content-subtle dark:text-white/30 hover:text-danger dark:hover:text-danger hover:bg-danger/10 transition-all active:scale-90"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
