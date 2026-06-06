import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const configuredApiUrl = env.VITE_API_URL || "http://127.0.0.1:8001";
  const isDocker = fs.existsSync("/.dockerenv");
  const pointsToContainerLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?/i.test(
    configuredApiUrl,
  );
  const apiUrl = isDocker && pointsToContainerLocalhost ? "http://web:8000" : configuredApiUrl;
  const debugProxy = env.VITE_DEBUG_PROXY === "true";

  if (debugProxy) {
    console.log(`Vite proxy: /api -> ${apiUrl}`);
  }

  const attachProxyDebug = (proxy: any) => {
    proxy.on("error", (err: Error) => {
      if (debugProxy) console.log("Proxy error:", err.message);
    });
    proxy.on("proxyReq", (proxyReq: any, req: any) => {
      if (debugProxy) console.log(`Proxy -> backend: ${req.method} ${req.url} -> ${proxyReq.path}`);
    });
    proxy.on("proxyRes", (proxyRes: any, req: any) => {
      if (debugProxy) console.log(`Proxy <- backend: ${req.method} ${req.url} -> status ${proxyRes.statusCode}`);
    });
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          configure: attachProxyDebug,
        },
        "/media": {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          configure: attachProxyDebug,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
