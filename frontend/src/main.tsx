import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import { useAuthStore } from "./store";
import { queryClient } from "./queryClient";
import "./index.css";

function BootstrapAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loadMe = useAuthStore((s) => s.loadMe);

  React.useEffect(() => {
    if (isAuthenticated && !user) {
      loadMe();
    }
  }, [isAuthenticated, user, loadMe]);

  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <BootstrapAuth />
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
