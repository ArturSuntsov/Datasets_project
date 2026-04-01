import React from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { RegisterRequest, Role } from "../types";
import { useAuthStore } from "../store";

type RegisterFormValues = {
  email: string;
  username: string;
  password: string;
  role: Role;
};

export function RegisterPage() {
  const navigate = useNavigate();
  const registerUser = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const {
    register: rhfRegister,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({ mode: "onBlur", defaultValues: { role: "customer" } });

  const onSubmit = async (values: RegisterFormValues) => {
    console.log('📝 [RegisterPage] onSubmit:', { email: values.email, username: values.username, role: values.role });
    try {
      const body: RegisterRequest = {
        email: values.email,
        username: values.username,
        password: values.password,
        role: values.role,
      };
      console.log('📝 [RegisterPage] Вызов registerUser()...');
      await registerUser(body);
      console.log('📝 [RegisterPage] Регистрация успешна, редирект на /login');
      // ✅ Редирект на страницу входа (не на API!)
      navigate("/login");
    } catch (e) {
      // Ошибка уже обработана в store, просто не делаем редирект
      console.error('📝 [RegisterPage] Ошибка регистрации:', e);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-4">
      <h1 className="mb-1 text-2xl font-bold">Регистрация</h1>
      <p className="mb-6 text-sm text-gray-600">Создайте аккаунт заказчика/исполнителя и начните работу.</p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...rhfRegister("email", {
              required: "Укажите email",
              pattern: { value: /^\S+@\S+\.\S+$/, message: "Неверный формат email" },
            })}
          />
          {errors.email ? <div className="text-xs text-red-600">{errors.email.message}</div> : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...rhfRegister("username", {
              required: "Укажите username",
              minLength: { value: 3, message: "Минимум 3 символа" },
            })}
          />
          {errors.username ? <div className="text-xs text-red-600">{errors.username.message}</div> : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...rhfRegister("password", {
              required: "Укажите пароль",
              minLength: { value: 8, message: "Минимум 8 символов" },
            })}
          />
          {errors.password ? <div className="text-xs text-red-600">{errors.password.message}</div> : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="role">
            Роль
          </label>
          <select
            id="role"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...rhfRegister("role")}
          >
            <option value="customer">Заказчик</option>
            <option value="annotator">Исполнитель</option>
            <option value="admin">Админ</option>
          </select>
        </div>

        {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {loading ? "Регистрация..." : "Создать аккаунт"}
        </button>

        <div className="text-center text-sm text-gray-600">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
            Вход
          </Link>
        </div>
      </form>
    </div>
  );
}

