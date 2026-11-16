import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // A new value on every build and dev start: the offline cache is dropped when the app changes.
  define: { __APP_BUILD__: JSON.stringify(String(Date.now())) },
  resolve: {
    alias: { "@bmserv/shared": fileURLToPath(new URL("../shared/src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Fail instead of moving to 5174: sign-in only trusts APP_URL (http://localhost:5173).
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:3000", xfwd: true },
      "/health": { target: "http://localhost:3000", xfwd: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      // The service worker also runs locally (npm run dev) so notifications can be tried on localhost.
      devOptions: { enabled: true, type: "classic", navigateFallback: "index.html" },
      includeAssets: ["brand/favicon-48.png", "brand/apple-touch-icon.png", "brand/logo-white.png", "brand/logo-colour.png"],
      manifest: {
        name: "BMServ",
        short_name: "BMServ",
        description: "Biomedical equipment, manuals, breakdowns and PMS",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#FFFFFF",
        theme_color: "#19445B",
        icons: [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Push and notification-click handlers (public/push-sw.js).
        importScripts: ["/push-sw.js"],
      },
    }),
  ],
});
