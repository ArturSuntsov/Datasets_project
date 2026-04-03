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

export const useAuthStore = create<AuthState>((set) => ({
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
    console.log('📦 [useAuthStore.register] Начало регистрации:', { email: body.email, username: body.username });
    set({ loading: true, error: null });
    try {
      const res: AuthResponse = await authAPI.register(body);
      
      // ✅ ИСПРАВЛЕНИЕ: создаём объект user если его нет в ответе
      // Бэкенд может возвращать user_id, email, username, role вместо user
      const user: User = res.user ?? {
        id: (res as any).user_id ?? '',
        email: (res as any).email ?? body.email,
        username: (res as any).username ?? body.username,
        role: (res as any).role ?? body.role ?? 'customer',
      };
      
      console.log('📦 [useAuthStore.register] Регистрация успешна:', { userId: user.id });

      // ✅ Сохраняем токены только если они есть в ответе
      if (res.access) {
        setTokens(res.access, res.refresh ?? getRefreshToken());
      }

      set({
        user: user,  // ✅ Теперь всегда объект User, не undefined
        accessToken: res.access ?? getAccessToken(),
        refreshToken: res.refresh ?? getRefreshToken(),
        isAuthenticated: true,
        loading: false,
        error: null,
      });
      console.log('📦 [useAuthStore.register] Состояние обновлено:', { user: user.email, isAuthenticated: true });
    } catch (e) {
      console.error('📦 [useAuthStore.register] Ошибка регистрации:', e);
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Ошибка регистрации',
      });
      throw e;
    }
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

