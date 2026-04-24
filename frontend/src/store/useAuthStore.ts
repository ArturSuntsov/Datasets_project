import { create } from "zustand";
import { AuthResponse, LoginRequest, RegisterRequest, User } from "../types";
import { authAPI, clearTokens, getAccessToken, getRefreshToken, setTokens } from "../services/api";
import { queryClient } from "../queryClient";

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: getAccessToken(),
  refreshToken: getRefreshToken(),
  isAuthenticated: !!getAccessToken(),
  loading: false,
  error: null,
  login: async (body) => {
    set({ loading: true, error: null });
    queryClient.clear();
    const res: AuthResponse = await authAPI.login(body);
    setTokens(res.access, res.refresh ?? getRefreshToken());
    queryClient.clear();
    set({
      user: res.user ?? null,
      accessToken: res.access,
      refreshToken: res.refresh ?? getRefreshToken(),
      isAuthenticated: true,
      loading: false,
    });
  },
  register: async (body) => {
    set({ loading: true, error: null });
    try {
      const res: AuthResponse = await authAPI.register(body);
      const user: User = res.user ?? {
        id: (res as any).user_id ?? "",
        email: (res as any).email ?? body.email,
        username: (res as any).username ?? body.username,
        role: (res as any).role ?? body.role ?? "customer",
      };
      if (res.access) {
        setTokens(res.access, res.refresh ?? getRefreshToken());
      }
      queryClient.clear();
      set({
        user,
        accessToken: res.access ?? getAccessToken(),
        refreshToken: res.refresh ?? getRefreshToken(),
        isAuthenticated: true,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "Registration failed" });
      throw e;
    }
  },
  logout: () => {
    clearTokens();
    queryClient.clear();
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    });
  },
  loadMe: async () => {
    set({ loading: true, error: null });
    try {
      const user = await authAPI.me();
      queryClient.clear();
      set({ user, isAuthenticated: true, loading: false });
    } catch (e) {
      clearTokens();
      queryClient.clear();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load me",
      });
    }
  },
}));
