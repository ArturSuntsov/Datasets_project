import React from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { LoginRequest } from "../types";
import { useAuthStore } from "../store";

type LoginFormValues = {
  identifier: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ mode: "onBlur" });

  const onSubmit = async (values: LoginFormValues) => {
    const body: LoginRequest = {
      identifier: values.identifier,
      password: values.password,
    };
    await login(body);
    navigate("/");
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center p-4">
      <h1 className="mb-1 text-2xl font-bold">Вход</h1>
      <p className="mb-6 text-sm text-gray-600">Войдите в систему, чтобы управлять датасетами и разметкой.</p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="identifier">
            Email или username
          </label>
          <input
            id="identifier"
            type="text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...register("identifier", {
              required: "Укажите email или username",
              minLength: { value: 3, message: "Слишком короткое значение" },
            })}
          />
          {errors.identifier ? <div className="text-xs text-red-600">{errors.identifier.message}</div> : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            {...register("password", {
              required: "Укажите пароль",
              minLength: { value: 6, message: "Слишком короткий пароль" },
            })}
          />
          {errors.password ? <div className="text-xs text-red-600">{errors.password.message}</div> : null}
        </div>

        {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {loading ? "Вход..." : "Войти"}
        </button>

        <div className="text-center text-sm text-gray-600">
          Нет аккаунта?{" "}
          <Link to="/register" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
            Регистрация
          </Link>
        </div>
      </form>
    </div>
  );
}

