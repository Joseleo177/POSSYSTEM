// Generador de códigos QR sin dependencias externas, por la misma razón que barcode.js: el
// bundle se arma dentro de Docker y sumar una librería para esto es reconstruir la imagen.
//
// Solo lo que hace falta para un enlace: modo byte (UTF-8), versiones 1 a 10 (hasta ~210
// caracteres) y corrección de errores M como mínimo. Si el texto entra en la misma versión con
// un nivel más alto (Q o H), se sube: el QR no crece y aguanta mejor una vitrina rayada o un
// cartel impreso con poca tinta.
//
// Devuelve { size, modules } donde modules[y][x] === true es un módulo oscuro.

// Niveles en el orden de las tablas; `bits` es el valor que va en la información de formato.
const ECL = [
    { name: "L", bits: 1 },
    { name: "M", bits: 0 },
    { name: "Q", bits: 3 },
    { name: "H", bits: 2 },
];

// Por nivel (L, M, Q, H) y versión (índice 1..10).
const ECC_PER_BLOCK = [
    [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];
const MAX_VERSION = 10;

// Módulos disponibles para datos y corrección, descontando patrones fijos.
const rawDataModules = (ver) => {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
        const align = Math.floor(ver / 7) + 2;
        n -= (25 * align - 10) * align - 55;
        if (ver >= 7) n -= 36;
    }
    return n;
};

const dataCodewords = (ver, ecl) =>
    Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

// ── Reed-Solomon sobre GF(256), polinomio 0x11D ─────────────────────────────
const gfMul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
};

const rsDivisor = (degree) => {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = gfMul(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = gfMul(root, 0x02);
    }
    return result;
};

const rsRemainder = (data, divisor) => {
    const result = divisor.map(() => 0);
    for (const b of data) {
        const factor = b ^ result.shift();
        result.push(0);
        divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
    }
    return result;
};

// Parte los datos en bloques, agrega la corrección de cada uno y los intercala.
const addEccAndInterleave = (data, ver, ecl) => {
    const numBlocks = NUM_BLOCKS[ecl][ver];
    const eccLen = ECC_PER_BLOCK[ecl][ver];
    const rawCodewords = Math.floor(rawDataModules(ver) / 8);
    const numShort = numBlocks - (rawCodewords % numBlocks);
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const divisor = rsDivisor(eccLen);

    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
        const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
        k += dat.length;
        const ecc = rsRemainder(dat, divisor);
        if (i < numShort) dat.push(0);
        blocks.push(dat.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
        blocks.forEach((block, j) => {
            // El relleno de los bloques cortos no viaja.
            if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]);
        });
    }
    return result;
};

const alignmentPositions = (ver, size) => {
    if (ver === 1) return [];
    const count = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
    return result;
};

const bit = (x, i) => ((x >>> i) & 1) !== 0;

const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x)    => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Penalización simplificada (rachas, bloques 2×2 y balance): cualquier máscara produce un QR
// válido; esto solo elige la que deja el dibujo más parejo para la cámara.
const penalty = (m, size) => {
    let score = 0;
    for (let y = 0; y < size; y++) {
        let runX = 1, runY = 1;
        for (let x = 1; x < size; x++) {
            if (m[y][x] === m[y][x - 1]) { runX++; if (runX === 5) score += 3; else if (runX > 5) score++; }
            else runX = 1;
            if (m[x][y] === m[x - 1][y]) { runY++; if (runY === 5) score += 3; else if (runY > 5) score++; }
            else runY = 1;
        }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (m[y][x]) dark++;
            if (x < size - 1 && y < size - 1) {
                const c = m[y][x];
                if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
            }
        }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
};

export function encodeQr(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));

    // Versión más chica donde entra con nivel M.
    const bitsFor = (ver) => 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    let ver = 1;
    while (ver <= MAX_VERSION && bitsFor(ver) > dataCodewords(ver, 1) * 8) ver++;
    if (ver > MAX_VERSION) throw new Error("El texto es demasiado largo para el código QR");

    let ecl = 1;
    for (const e of [2, 3]) if (bitsFor(ver) <= dataCodewords(ver, e) * 8) ecl = e;

    // ── Cadena de bits: modo byte, largo, datos, terminador y relleno ───────
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(b => push(b, 8));
    const capacity = dataCodewords(ver, ecl) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
        data.push(b);
    }
    const codewords = addEccAndInterleave(data, ver, ecl);

    // ── Matriz ─────────────────────────────────────────────────────────────
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };

    for (let i = 0; i < size; i++) {
        setFn(6, i, i % 2 === 0);
        setFn(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx, y = cy + dy;
                if (x < 0 || x >= size || y < 0 || y >= size) continue;
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                setFn(x, y, d !== 2 && d !== 4);
            }
        }
    }
    const align = alignmentPositions(ver, size);
    const last = align.length - 1;
    align.forEach((ax, i) => align.forEach((ay, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }));

    const drawFormat = (mask) => {
        const d = (ECL[ecl].bits << 3) | mask;
        let rem = d;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const f = ((d << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) setFn(8, i, bit(f, i));
        setFn(8, 7, bit(f, 6));
        setFn(8, 8, bit(f, 7));
        setFn(7, 8, bit(f, 8));
        for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(f, i));
        for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(f, i));
        for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(f, i));
        setFn(8, size - 8, true);
    };
    drawFormat(0);

    if (ver >= 7) {
        let rem = ver;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const v = (ver << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const a = size - 11 + (i % 3), b = Math.floor(i / 3);
            setFn(a, b, bit(v, i));
            setFn(b, a, bit(v, i));
        }
    }

    // Recorrido en zigzag de dos columnas, de abajo a la derecha hacia arriba.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - vert : vert;
                if (!isFn[y][x] && i < codewords.length * 8) {
                    modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
                    i++;
                }
            }
        }
    }

    const applyMask = (mask) => {
        const fn = MASKS[mask];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) if (!isFn[y][x] && fn(x, y)) modules[y][x] = !modules[y][x];
        }
    };

    let best = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
        applyMask(mask);
        drawFormat(mask);
        const s = penalty(modules, size);
        if (s < bestScore) { best = mask; bestScore = s; }
        applyMask(mask); // XOR: aplicarla otra vez la deshace
    }
    applyMask(best);
    drawFormat(best);

    return { size, modules };
}

/**
 * Trazo SVG (atributo `d`) de los módulos oscuros, con `border` módulos de margen blanco.
 * Un solo <path> en vez de un <rect> por módulo: liviano y sin costuras entre cuadros.
 */
export function qrSvgPath({ size, modules }, border = 4) {
    const parts = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) if (modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`);
    }
    return parts.join("");
}
