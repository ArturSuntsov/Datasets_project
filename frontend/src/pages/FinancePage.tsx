import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeAPI } from "../services/api";
import { PaymentRequestBody, Transaction, ApiListResponse } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function FinancePage() {
  const queryClient = useQueryClient();
  const [limit] = React.useState(20);
  const [offset, setOffset] = React.useState(0);
  const [status, setStatus] = React.useState<string>("");

  const txQuery = useQuery<ApiListResponse<Transaction>>({
    queryKey: ["finance-transactions", limit, offset, status],
    queryFn: () => financeAPI.transactions({ limit, offset, status: status || undefined }),
  });

  const payMutation = useMutation({
    mutationFn: (body: PaymentRequestBody) => financeAPI.pay(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions"] }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (body: PaymentRequestBody) => financeAPI.withdraw(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions"] }),
  });

  const [payForm, setPayForm] = React.useState<PaymentRequestBody>({ amount: "10", currency: "USD" });
  const [withdrawForm, setWithdrawForm] = React.useState<PaymentRequestBody>({ amount: "5", currency: "USD" });

  const total = txQuery.data?.total ?? 0;
  const items = txQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-2 text-sm font-semibold">Пополнение (stub)</div>
          <div className="grid gap-3">
            <input
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={String(payForm.amount)}
              onChange={(e) => setPayForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="amount"
            />
            <input
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={payForm.currency ?? "USD"}
              onChange={(e) => setPayForm((s) => ({ ...s, currency: e.target.value }))}
              placeholder="currency"
            />
            <button
              type="button"
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={payMutation.isPending}
              onClick={() => payMutation.mutate(payForm)}
            >
              {payMutation.isPending ? "Отправляем..." : "Оплатить"}
            </button>
          </div>
          {payMutation.isError ? <div className="mt-2 text-sm text-red-700">Ошибка оплаты</div> : null}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-2 text-sm font-semibold">Выплата (stub)</div>
          <div className="grid gap-3">
            <input
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={String(withdrawForm.amount)}
              onChange={(e) => setWithdrawForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="amount"
            />
            <input
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={withdrawForm.currency ?? "USD"}
              onChange={(e) => setWithdrawForm((s) => ({ ...s, currency: e.target.value }))}
              placeholder="currency"
            />
            <button
              type="button"
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
              disabled={withdrawMutation.isPending}
              onClick={() => withdrawMutation.mutate(withdrawForm)}
            >
              {withdrawMutation.isPending ? "Отправляем..." : "Запросить выплату"}
            </button>
          </div>
          {withdrawMutation.isError ? <div className="mt-2 text-sm text-red-700">Ошибка выплаты</div> : null}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Транзакции</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">История всех операций пользователя</div>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="">Все статусы</option>
            <option value="pending">pending</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </div>

        {txQuery.isLoading ? (
          <LoadingSpinner />
        ) : txQuery.isError ? (
          <div className="text-sm text-red-700">Не удалось загрузить транзакции</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3 font-mono text-xs">{t.id}</td>
                      <td className="py-2 pr-3">{t.type}</td>
                      <td className="py-2 pr-3">{t.status}</td>
                      <td className="py-2 pr-3">
                        {t.amount} {t.currency}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-300">{t.created_at ?? "—"}</td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-sm text-gray-600">
                        Нет транзакций
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Назад
              </button>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {offset + 1}-{Math.min(offset + limit, total)} из {total}
              </div>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Дальше
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

