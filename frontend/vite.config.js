import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// En desarrollo local: backend corre en localhost:4000
// En Docker: el proxy lo maneja nginx (este archivo no se usa en producción)
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:4000";

// Publica /sw.js (ver pwa/sw.js) con la lista exacta de archivos de este build, para que la
// app abra sin internet. Se hace al terminar el build, cuando index.html y todos los assets ya
// están escritos en dist. La versión sale del contenido: si nada cambió, el navegador no
// vuelve a descargar nada.
//
// Queda fuera el visor de PDF (pdfjs): pesa más que todo lo demás junto y solo lo usa la
// conciliación bancaria, que igual necesita el servidor.
function nexusServiceWorker() {
  let outDir = "dist";
  return {
    name: "nexus-service-worker",
    apply: "build",
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const archivos = [];
      const recorrer = (dir) => {
        for (const nombre of readdirSync(dir)) {
          const ruta = join(dir, nombre);
          if (statSync(ruta).isDirectory()) recorrer(ruta);
          else archivos.push("/" + relative(outDir, ruta).split(sep).join("/"));
        }
      };
      recorrer(outDir);
      const precache = archivos
        .filter((f) => f !== "/sw.js" && !f.endsWith(".map") && !/pdf/i.test(f))
        .sort();
      const hash = createHash("sha256");
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest("hex").slice(0, 12);
      const sw = readFileSync("pwa/sw.js", "utf8")
        .replace('const VERSION = "__VERSION__";', `const VERSION = ${JSON.stringify(version)};`)
        .replace("const PRECACHE = __PRECACHE__;", `const PRECACHE = ${JSON.stringify(precache)};`);
      if (sw.includes('"__VERSION__"') || sw.includes("= __PRECACHE__")) {
        throw new Error("pwa/sw.js: no se pudo completar la plantilla del service worker");
      }
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), nexusServiceWorker()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      "/uploads": {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});
