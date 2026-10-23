'use strict';

/**
 * Fórmulas de las recetas: "(L + 0,10) * (A + 0,25)", "P * 2", "techo(L / 1,22)".
 *
 * Es un intérprete propio, mínimo y cerrado: números, variables de la receta, + − × ÷,
 * paréntesis y unas pocas funciones. Nada de eval ni de Function: el texto lo escribe un
 * usuario y se evalúa en el servidor.
 *
 *   números     1,5  o  1.5  (coma o punto decimal)
 *   variables   las que declara la receta (L, A, P...), sin distinguir mayúsculas
 *   funciones   redondear(x; decimales)  techo(x)  piso(x)  min(a; b; ...)  max(a; b; ...)  abs(x)
 *               (también en inglés: round, ceil, floor). Los argumentos se separan con ";",
 *               porque la coma es el decimal.
 */

const MAX_LEN = 200;
const MAX_DEPTH = 30;

class FormulaError extends Error {}

const FUNCS = {
  REDONDEAR: (args) => { need(args, 1, 2); const d = args.length > 1 ? Math.trunc(args[1]) : 0; if (d < 0 || d > 6) throw new FormulaError("redondear admite de 0 a 6 decimales"); const f = 10 ** d; return Math.round(args[0] * f) / f; },
  TECHO:     (args) => { need(args, 1, 1); return Math.ceil(args[0]); },
  PISO:      (args) => { need(args, 1, 1); return Math.floor(args[0]); },
  MIN:       (args) => { need(args, 1, 20); return Math.min(...args); },
  MAX:       (args) => { need(args, 1, 20); return Math.max(...args); },
  ABS:       (args) => { need(args, 1, 1); return Math.abs(args[0]); },
};
FUNCS.ROUND = FUNCS.REDONDEAR;
FUNCS.CEIL = FUNCS.TECHO;
FUNCS.FLOOR = FUNCS.PISO;

function need(args, min, max) {
  if (args.length < min || args.length > max) throw new FormulaError("cantidad de argumentos no válida");
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (/[0-9]/.test(c) || ((c === "." || c === ",") && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i, seenDot = false;
      while (j < src.length && (/[0-9]/.test(src[j]) || ((src[j] === "." || src[j] === ",") && !seenDot && /[0-9]/.test(src[j + 1] || "")))) {
        if (src[j] === "." || src[j] === ",") seenDot = true;
        j++;
      }
      tokens.push({ t: "num", v: parseFloat(src.slice(i, j).replace(",", ".")) });
      i = j; continue;
    }
    if (/[A-Za-zÁÉÍÓÚáéíóúÑñ_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ_]/.test(src[j])) j++;
      tokens.push({ t: "id", v: src.slice(i, j).toUpperCase() });
      i = j; continue;
    }
    if ("+-*/();×÷".includes(c)) {
      // × y ÷ por si se copian de una calculadora.
      const op = c === "×" ? "*" : c === "÷" ? "/" : c;
      tokens.push({ t: "op", v: op });
      i++; continue;
    }
    throw new FormulaError(`carácter no permitido: "${c}"`);
  }
  return tokens;
}

// Descenso recursivo. Devuelve un árbol pequeño: { n }, { v }, { op, a, b }, { neg }, { f, args }.
function parse(src) {
  const text = String(src ?? "").trim();
  if (!text) throw new FormulaError("está vacía");
  if (text.length > MAX_LEN) throw new FormulaError(`es demasiado larga (máximo ${MAX_LEN} caracteres)`);
  const tokens = tokenize(text);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek()?.t === "op" && peek().v === v;

  function expr(depth) {
    if (depth > MAX_DEPTH) throw new FormulaError("tiene demasiados paréntesis anidados");
    let node = term(depth);
    while (isOp("+") || isOp("-")) { const op = tokens[pos++].v; node = { op, a: node, b: term(depth) }; }
    return node;
  }
  function term(depth) {
    let node = factor(depth);
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].v; node = { op, a: node, b: factor(depth) };
    }
    return node;
  }
  function factor(depth) {
    if (isOp("-")) { pos++; return { neg: factor(depth + 1) }; }
    if (isOp("+")) { pos++; return factor(depth + 1); }
    const tk = peek();
    if (!tk) throw new FormulaError("termina de forma incompleta");
    if (tk.t === "num") { pos++; return { n: tk.v }; }
    if (tk.t === "id") {
      pos++;
      if (isOp("(")) {
        if (!FUNCS[tk.v]) throw new FormulaError(`función desconocida: ${tk.v.toLowerCase()}`);
        pos++;
        const args = [];
        if (!isOp(")")) {
          args.push(expr(depth + 1));
          while (isOp(";")) { pos++; args.push(expr(depth + 1)); }
        }
        if (!isOp(")")) throw new FormulaError("falta cerrar un paréntesis");
        pos++;
        return { f: tk.v, args };
      }
      return { v: tk.v };
    }
    if (isOp("(")) {
      pos++;
      const node = expr(depth + 1);
      if (!isOp(")")) throw new FormulaError("falta cerrar un paréntesis");
      pos++;
      return node;
    }
    throw new FormulaError(`no se esperaba "${tk.v}"`);
  }

  const tree = expr(0);
  if (pos < tokens.length) throw new FormulaError(`sobra "${tokens[pos].v}"`);
  return tree;
}

function run(node, vars) {
  if ("n" in node) return node.n;
  if ("v" in node) {
    if (!Object.prototype.hasOwnProperty.call(vars, node.v)) throw new FormulaError(`la variable ${node.v} no está en la receta`);
    return vars[node.v];
  }
  if ("neg" in node) return -run(node.neg, vars);
  if ("f" in node) return FUNCS[node.f](node.args.map(a => run(a, vars)));
  const a = run(node.a, vars), b = run(node.b, vars);
  switch (node.op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": if (b === 0) throw new FormulaError("divide entre cero"); return a / b;
    default: throw new FormulaError("operación no válida");
  }
}

/**
 * Evalúa una fórmula con las variables dadas ({ L: 1.8, A: 0.6 }, claves en mayúscula).
 * Lanza FormulaError con un mensaje legible si algo no cuadra.
 */
function evaluate(src, vars = {}) {
  const value = run(parse(src), vars);
  if (!Number.isFinite(value)) throw new FormulaError("no da un número");
  return value;
}

// Variables que usa una fórmula, para validar que estén declaradas.
function variablesIn(src) {
  const out = new Set();
  const walk = (n) => {
    if ("v" in n) out.add(n.v);
    else if ("neg" in n) walk(n.neg);
    else if ("f" in n) n.args.forEach(walk);
    else if ("op" in n) { walk(n.a); walk(n.b); }
  };
  walk(parse(src));
  return [...out];
}

module.exports = { evaluate, variablesIn, parse, FormulaError, MAX_LEN };
