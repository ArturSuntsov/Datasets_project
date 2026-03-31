import { create } from "zustand";
import { AuthResponse, LoginRequest, RegisterRequest, User } from "../types";
import { authAPI, clearTokens, getAccessToken, getRefreshToken, setTokens } from "../services/api";

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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: getAccessToken(),
  refreshToken: getRefreshToken(),
  isAuthenticated: !!getAccessToken(),
  loading: false,
  error: null,

  login: async (body) => {
    set({ loading: true, error: null });
    const res: AuthResponse = await authAPI.login(body);
    setTokens(res.access, res.refresh ?? getRefreshToken());

    set({
      user: res.user,
      accessToken: res.access,
      refreshToken: res.refresh ?? getRefreshToken(),
      isAuthenticated: true,
      loading: false,
    });
  },

  register: async (body) => {
    set({ loading: true, error: null });
    const res: AuthResponse = await authAPI.register(body);
    setTokens(res.access, res.refresh ?? getRefreshToken());

    set({
      user: res.user,
      accessToken: res.access,
      refreshToken: res.refresh ?? getRefreshToken(),
      isAuthenticated: true,
      loading: false,
    });
  },

  logout: () => {
    clearTokens();
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
      set({ user, isAuthenticated: true, loading: false });
    } catch (e) {
      // Если token протух/битый — сбрасываем авторизацию.
      clearTokens();
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

