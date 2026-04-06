import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vite config:
 * - alias для удобных импортов
 * - proxy для `/api` на backend с логированием
 *
 * ВАЖНО: Для Docker Desktop на Windows используем host.docker.internal
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  
  // ВРЕМЕННО: жёстко задаём URL для Docker
  // const apiUrl = env.VITE_API_URL || "http://host.docker.internal:8000";
  const apiUrl = "http://host.docker.internal:8000";  // ← ЖЁСТКО

  console.log(`🔧 Vite Proxy: /api → ${apiUrl}`);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('❌ PROXY ERROR:', err.message);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log(`📤 PROXY → Backend: ${req.method} ${req.url} → ${proxyReq.path}`);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log(`📥 Proxy ← Backend: ${req.method} ${req.url} → Status ${proxyRes.statusCode}`);
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
