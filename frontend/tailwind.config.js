/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#ffffff",
          // surface-1 / surface-dark-1 se usan en 13 archivos pero nunca estuvieron definidos:
          // Tailwind no generaba esas clases y los paneles quedaban transparentes (invisibles
          // en tema claro, donde el fondo de página ya es surface-2). Son el escalón "panel
          // elevado sobre la página", igual que el .card de index.css.
          1:       "#ffffff",
          2:       "#f9fafb",
          3:       "#f3f4f6",
          dark:    "#0b0e14",
          "dark-1":"#0b0e14",
          "dark-2":"#11151f",
          "dark-3":"#1a1f2e",
        },
        border: {
          DEFAULT: "#e5e7eb",
          dark:    "#262c3d",
        },
        content: {
          DEFAULT:  "#111827",
          // Definidos como variables CSS en index.css: cambian de valor entre claro y
          // oscuro, para que text-content-muted / -subtle sean legibles en ambos temas
          // aunque el componente no declare una variante dark:.
          muted:    "rgb(var(--c-content-muted) / <alpha-value>)",
          subtle:   "rgb(var(--c-content-subtle) / <alpha-value>)",
          dark:     "#f3f4f6",
          "dark-muted": "#CBD5E1", // Slighter brighter blue-gray
        },
        heading: {
          DEFAULT: "#111827",
          dark:    "#ffffff",
        },
        brand: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        success: { DEFAULT: "#10b981", light: "#d1fae5", dark: "#065f46" },
        warning: { DEFAULT: "#f59e0b", light: "#fef3c7", dark: "#78350f" },
        danger:  { DEFAULT: "#ef4444", light: "#fee2e2", dark: "#7f1d1d" },
        info:    { DEFAULT: "#0ea5e9", light: "#e0f2fe", dark: "#0c4a6e" },
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
        display: ["'Outfit'", "'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:        "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "card-md":   "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "card-lg":   "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "card-xl":   "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        "card-dark":    "0 1px 3px 0 rgb(0 0 0 / 0.4)",
        "card-dark-md": "0 4px 12px 0 rgb(0 0 0 / 0.5)",
        premium: "0 0 0 1px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.05), 0 12px 24px rgba(0,0,0,0.05)",
        "premium-dark": "0 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.2), 0 12px 24px rgba(0,0,0,0.2)",
      },
      backgroundImage: {
        'glass-light': 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1))',
        'glass-dark': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0))',
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
