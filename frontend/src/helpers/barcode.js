// Generador de códigos de barras sin dependencias externas.
//
// Devuelve el patrón como cadena de bits ("1" = barra, "0" = espacio); quien lo dibuje decide
// el ancho de módulo. Se resolvió así en vez de sumar jsbarcode porque el bundle se arma dentro
// de Docker y una dependencia más significa reconstruir la imagen para algo que son dos tablas.
//
// Simbología elegida automáticamente según el valor:
//   • 13 dígitos → EAN-13   • 12 dígitos → UPC-A   • 8 dígitos → EAN-8
//   • 12 dígitos escritos sin verificador → se completa el dígito de control
//   • cualquier otra cosa → Code 39, que lee cualquier lector láser y no exige checksum

// ── EAN / UPC ───────────────────────────────────────────────────────────────
const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];

// Paridad de los 6 dígitos de la izquierda, según el primer dígito del EAN-13
const EAN13_PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

// Dígito verificador: pesos alternos 3/1 leyendo de derecha a izquierda
const checkDigit = (digits) => {
    let sum = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
        sum += Number(digits[i]) * w;
    }
    return (10 - (sum % 10)) % 10;
};

const ean13 = (code) => {
    const parity = EAN13_PARITY[Number(code[0])];
    let bits = "101";
    for (let i = 1; i <= 6; i++) {
        bits += parity[i - 1] === "L" ? EAN_L[Number(code[i])] : EAN_G[Number(code[i])];
    }
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
    return bits + "101";
};

const ean8 = (code) => {
    let bits = "101";
    for (let i = 0; i < 4; i++) bits += EAN_L[Number(code[i])];
    bits += "01010";
    for (let i = 4; i < 8; i++) bits += EAN_R[Number(code[i])];
    return bits + "101";
};

// ── Code 39 ─────────────────────────────────────────────────────────────────
// Cada carácter son 9 elementos alternando barra/espacio (empieza en barra), de los cuales
// exactamente 3 son anchos. n = 1 módulo, w = 3 módulos.
const CODE39 = {
    "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
    "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
    "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn",
    "F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
    "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn",
    "P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
    "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn",
    "Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn",
    "/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn",
};

const code39 = (value) => {
    const chars = `*${value.toUpperCase()}*`.split("");
    if (chars.some(c => !CODE39[c])) return null;
    return chars
        .map(c => CODE39[c].split("").map((el, i) => {
            const width = el === "w" ? 3 : 1;
            return (i % 2 === 0 ? "1" : "0").repeat(width);
        }).join(""))
        .join("0"); // separador entre caracteres: un espacio estrecho
};

// Construye el código. Devuelve { bits, text, symbology } o null si el valor no es codificable.
export const buildBarcode = (raw) => {
    const value = String(raw ?? "").trim();
    if (!value) return null;

    if (/^\d+$/.test(value)) {
        if (value.length === 13) return { bits: ean13(value), text: value, symbology: "EAN-13" };
        if (value.length === 8)  return { bits: ean8(value),  text: value, symbology: "EAN-8" };
        // 12 dígitos son ambiguos: UPC-A completo o EAN-13 al que le falta el verificador.
        // Se toma como UPC-A —lo que el usuario tecleó— y se imprime como EAN-13 con el 0 delante,
        // que es exactamente la misma barra y lo que devuelve cualquier lector.
        if (value.length === 12) {
            const full = `0${value}`;
            return { bits: ean13(full), text: value, symbology: "UPC-A" };
        }
        if (value.length === 7)  {
            const full = value + checkDigit(value);
            return { bits: ean8(full), text: full, symbology: "EAN-8" };
        }
        if (value.length === 11) {
            const full = `0${value}${checkDigit(`0${value}`)}`;
            return { bits: ean13(full), text: full.slice(1), symbology: "UPC-A" };
        }
    }

    const bits = code39(value);
    return bits ? { bits, text: value.toUpperCase(), symbology: "CODE 39" } : null;
};

// Agrupa los bits en rectángulos negros: [{ x, width }] en módulos.
export const barcodeBars = (bits) => {
    const bars = [];
    let i = 0;
    while (i < bits.length) {
        if (bits[i] === "1") {
            let w = 0;
            while (i + w < bits.length && bits[i + w] === "1") w++;
            bars.push({ x: i, width: w });
            i += w;
        } else i++;
    }
    return bars;
};
