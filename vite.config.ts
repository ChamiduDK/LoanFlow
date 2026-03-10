import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const basePath = env.VITE_BASE_PATH?.trim();

  return {
    base: basePath && basePath !== "/" ? `${basePath.replace(/^\/?/, "/").replace(/\/?$/, "/")}` : "/",
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return;
            }

            const normalizedId = id.replace(/\\/g, "/");

            if (normalizedId.includes("/@supabase/")) return "supabase";
            if (normalizedId.includes("/@tanstack/")) return "react-query";
            if (normalizedId.includes("/react-router")) return "react-router";
            if (normalizedId.includes("/@radix-ui/")) return "radix-ui";
            if (normalizedId.includes("/@tensorflow/")) return "ml";
            if (normalizedId.includes("/lucide-react/")) return "icons";
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/") ||
              normalizedId.includes("/node_modules/use-sync-external-store/")
            ) {
              return "react-core";
            }

            return "vendor";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
