import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo local: backend corre en localhost:4000
// En Docker: el proxy lo maneja nginx (este archivo no se usa en producción)
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
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
