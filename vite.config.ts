import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react-pdf") || id.includes("pdfjs-dist")) {
            return "pdf-viewer-vendor";
          }

          if (id.includes("jspdf")) {
            return "jspdf-vendor";
          }

          if (id.includes("html2canvas")) {
            return "html2canvas-vendor";
          }

          if (id.includes("recharts") || id.includes("chart.js") || id.includes("react-chartjs-2")) {
            return "charts-vendor";
          }

          if (id.includes("@supabase/")) {
            return "supabase-vendor";
          }

          if (id.includes("@fullcalendar/")) {
            return "calendar-vendor";
          }

          if (id.includes("@radix-ui/") || id.includes("embla-carousel-react") || id.includes("vaul")) {
            return "ui-vendor";
          }

          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("rehype-")) {
            return "markdown-vendor";
          }

          if (id.includes("firebase") || id.includes("@capacitor-firebase/")) {
            return "firebase-vendor";
          }

          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "maps-vendor";
          }

          if (id.includes("posthog-js")) {
            return "analytics-vendor";
          }

          if (id.includes("framer-motion")) {
            return "motion-vendor";
          }

          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
