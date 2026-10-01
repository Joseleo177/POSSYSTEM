// Logo oficial de Nexus ERP, redibujado en vectores desde el original (hoja carta de
// 2550×3300 con el logo al centro). Como SVG se ve nítido a cualquier tamaño y pesa casi nada.
//
// Las letras y el ángulo usan `currentColor`: negro en modo claro y blanco en oscuro, según el
// color de texto donde se ponga. El original es negro fijo y en fondo oscuro desaparecía.
// El turquesa del rayo es el color de la marca Nexus y no cambia con el tema ni con el color
// que cada empresa elige para su sistema.

export const NEXUS_CYAN = "#00E5FF";

// Piezas en las coordenadas del original (escala de la vista de 1546 px de ancho).
const CHEVRON = "510,578 613,578 738,760 601,941 500,941 635,760";
const BARRA   = "872,576 976,576 903,680 853,680";
const RAYO    = "852,621 788,712 832,712 815,781 881,690 836,690";
const PIE     = "769,724 821,723 797,828 846,760 981,940 880,940 744,760";

const N = "242,687 285,687 366,773 366,687 405,687 405,827 363,827 282,742 282,827 242,827";
const E = "426,687 571,687 571,719 465,719 465,741 521,741 521,774 465,774 465,795 571,795 571,827 426,827";
const U = "M909 689H948V797H1032V689H1072V804Q1072 815 1062 822Q1053 829 1040 829H941Q926 829 917 822Q909 815 909 804Z";
const S = "M1255 689H1113Q1105 689 1099 696Q1093 702 1093 709V748Q1093 762 1101 769Q1108 775 1120 775H1212Q1216 775 1216 779V793Q1216 797 1212 797H1093V829H1235Q1243 829 1249 822Q1255 816 1255 809V770Q1255 760 1250 754Q1243 743 1229 743H1136Q1132 743 1132 739V725Q1132 721 1136 721H1255Z";

function Marca() {
    return (
        <>
            <polygon points={CHEVRON} fill="currentColor" />
            <polygon points={BARRA} fill={NEXUS_CYAN} />
            <polygon points={RAYO} fill={NEXUS_CYAN} />
            <polygon points={PIE} fill={NEXUS_CYAN} />
        </>
    );
}

// Logo completo: NEXUS con la X de rayo y el "ERP" chico abajo a la derecha.
export function NexusLogo({ className = "h-8 w-auto", title = "Nexus ERP" }) {
    return (
        <svg viewBox="232 566 1036 384" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
            <title>{title}</title>
            <polygon points={N} fill="currentColor" />
            <polygon points={E} fill="currentColor" />
            <Marca />
            <path d={U} fill="currentColor" />
            <path d={S} fill="currentColor" />
            <text x="1175" y="866" textLength="80" lengthAdjust="spacingAndGlyphs"
                fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="38" fill="currentColor">
                ERP
            </text>
        </svg>
    );
}

// Solo la X: para espacios cuadrados y chicos (ícono de app, avatar, favicon).
export function NexusMark({ className = "w-8 h-8", title = "Nexus ERP" }) {
    return (
        <svg viewBox="470 488 541 541" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
            <title>{title}</title>
            <Marca />
        </svg>
    );
}
