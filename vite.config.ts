import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "src/client"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@client": path.resolve(__dirname, "src/client"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // Vite serves the client tree under root `src/client`, which contains
        // `src/client/api/*.ts` modules. Without a bypass these requests would
        // be proxied to the backend (and 404). Skip any `/api/*` paths that
        // are local source modules so Vite can serve them as ESM.
        bypass: (req) => {
          const url = req.url ?? "";
          if (/^\/api\/[^/?]+\.(?:tsx?|css|map|js)(?:\?|$)/u.test(url)) {
            return url;
          }
          return null;
        },
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
