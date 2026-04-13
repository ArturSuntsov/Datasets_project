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

  // Для Docker: host.docker.internal — это хост машина Windows
  // Для локальной разработки: localhost
  const apiUrl = env.VITE_API_URL || "http://host.docker.internal:8000";

  console.log(`🔧 Vite Proxy: /api → ${apiUrl}`);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,  // Порт frontend
      host: true,  // Доступ из Docker сети
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            // Логирование ошибок proxy
            proxy.on('error', (err, _req, _res) => {
              console.log('❌ PROXY ERROR:', err.message);
            });
            // Логирование запросов
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log(`📤 PROXY → Backend: ${req.method} ${req.url} → ${proxyReq.path}`);
            });
            // Логирование ответов
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
