import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeAPI } from "../services/api";
import { PaymentRequestBody, Transaction, ApiListResponse, TransferRequest } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";
import { isAnnotatorRole, isCustomerRole } from "../utils/roles";

type FinanceTabId = "history" | "pay" | "withdraw" | "transfer";

type FinanceTab = {
  id: FinanceTabId;
  label: string;
};

export function FinancePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? "customer";
  const isCustomer = isCustomerRole(role);
  const isAnnotator = isAnnotatorRole(role);

  const [limit] = React.useState(20);
  const [offset, setOffset] = React.useState(0);
  const [status, setStatus] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<FinanceTabId>("history");

  const txQuery = useQuery<ApiListResponse<Transaction>>({
    queryKey: ["finance-transactions", user?.id, limit, offset, status],
    queryFn: () => financeAPI.transactions({ limit, offset, status: status || undefined }),
    enabled: !!user?.id,
  });

  const payMutation = useMutation({
    mutationFn: (body: PaymentRequestBody) => financeAPI.pay(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions", user?.id] }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (body: PaymentRequestBody) => financeAPI.withdraw(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions", user?.id] }),
  });

  const transferMutation = useMutation({
    mutationFn: (body: TransferRequest) => financeAPI.transfer(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance-transactions", user?.id] }),
  });

  const [payForm, setPayForm] = React.useState<PaymentRequestBody>({ amount: "10", currency: "USD", description: "" });
  const [withdrawForm, setWithdrawForm] = React.useState<PaymentRequestBody>({ amount: "5", currency: "USD", description: "" });
  const [transferForm, setTransferForm] = React.useState<TransferRequest>({ amount: "10", currency: "USD", description: "" });

  const total = txQuery.data?.total ?? 0;
  const items = txQuery.data?.items ?? [];

  const availableTabs: FinanceTab[] = [
    { id: "history", label: "📋 История" },
    ...(isCustomer ? [{ id: "pay" as const, label: "💳 Пополнить" }] : []),
    ...(isAnnotator ? [{ id: "withdraw" as const, label: "💸 Вывести" }] : []),
    ...(isCustomer ? [{ id: "transfer" as const, label: "🔄 Перевод" }] : []),
  ];

  React.useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id ?? "history");
    }
  }, [activeTab, availableTabs]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "payment":
        return "💰";
      case "payout":
        return "💸";
      case "transfer":
        return "🔄";
      case "earnings":
        return "⭐";
      default:
        return "📝";
    }
  };

  const getStatusBadge = (txStatus: string) => {
    const badges: Record<string, string> = {
      pending: "badge-warning",
      completed: "badge-success",
      failed: "badge-error",
      reversed: "badge-secondary",
    };
    return badges[txStatus] || "badge-secondary";
  };

  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">💰 Финансы</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {isCustomer
            ? "Пополнение баланса и расчеты с исполнителями"
            : "История начислений и вывод средств"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "bg-gradient-primary text-white shadow-md"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Форма пополнения */}
      {activeTab === "pay" && (
        <div className="card max-w-md">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">💳 Пополнение баланса</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Сумма</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm((s) => ({ ...s, amount: e.target.value }))}
                className="input-field"
                placeholder="100.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Валюта</label>
              <select
                value={payForm.currency}
                onChange={(e) => setPayForm((s) => ({ ...s, currency: e.target.value }))}
                className="input-field"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label>
              <input
                type="text"
                value={payForm.description || ""}
                onChange={(e) => setPayForm((s) => ({ ...s, description: e.target.value }))}
                className="input-field"
                placeholder="Пополнение счета"
              />
            </div>
            <button
              type="button"
              disabled={payMutation.isPending}
              onClick={() => payMutation.mutate(payForm)}
              className="btn-primary w-full"
            >
              {payMutation.isPending ? <LoadingSpinner size="sm" /> : "💳 Пополнить"}
            </button>
          </div>
        </div>
      )}

      {/* Форма вывода */}
      {activeTab === "withdraw" && (
        <div className="card max-w-md">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">💸 Вывод средств</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Сумма</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm((s) => ({ ...s, amount: e.target.value }))}
                className="input-field"
                placeholder="50.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Валюта</label>
              <select
                value={withdrawForm.currency}
                onChange={(e) => setWithdrawForm((s) => ({ ...s, currency: e.target.value }))}
                className="input-field"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label>
              <input
                type="text"
                value={withdrawForm.description || ""}
                onChange={(e) => setWithdrawForm((s) => ({ ...s, description: e.target.value }))}
                className="input-field"
                placeholder="Вывод на карту"
              />
            </div>
            <button
              type="button"
              disabled={withdrawMutation.isPending}
              onClick={() => withdrawMutation.mutate(withdrawForm)}
              className="btn-primary w-full bg-blue-600 hover:bg-blue-700"
            >
              {withdrawMutation.isPending ? <LoadingSpinner size="sm" /> : "💸 Вывести"}
            </button>
          </div>
        </div>
      )}

      {/* Форма перевода */}
      {activeTab === "transfer" && (
        <div className="card max-w-md">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🔄 Перевод пользователю</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Получатель (username или email)
              </label>
              <input
                type="text"
                value={transferForm.to_username || transferForm.to_email || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes("@")) {
                    setTransferForm((s) => ({ 
                      ...s, 
                      to_email: value, 
                      to_username: undefined, 
                      to_user_id: undefined 
                    }));
                  } else {
                    setTransferForm((s) => ({ 
                      ...s, 
                      to_username: value, 
                      to_email: undefined, 
                      to_user_id: undefined 
                    }));
                  }
                }}
                className="input-field"
                placeholder="customer@test.com  или  annotator"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Можно ввести email или username получателя
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Сумма</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={transferForm.amount}
                onChange={(e) => setTransferForm((s) => ({ ...s, amount: e.target.value }))}
                className="input-field"
                placeholder="25.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание (опционально)</label>
              <input
                type="text"
                value={transferForm.description || ""}
                onChange={(e) => setTransferForm((s) => ({ ...s, description: e.target.value }))}
                className="input-field"
                placeholder="Оплата за разметку"
              />
            </div>

            <button
              type="button"
              disabled={transferMutation.isPending}
              onClick={() => transferMutation.mutate(transferForm)}
              className="btn-primary w-full bg-green-600 hover:bg-green-700"
            >
              {transferMutation.isPending ? <LoadingSpinner size="sm" /> : "🔄 Отправить перевод"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">📋 История операций</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field w-auto">
            <option value="">Все статусы</option>
            <option value="pending">В обработке</option>
            <option value="completed">Завершено</option>
            <option value="failed">Ошибка</option>
          </select>
        </div>

        {txQuery.isLoading ? (
          <div className="py-12">
            <LoadingSpinner />
          </div>
        ) : txQuery.isError ? (
          <div className="py-12 text-center text-red-600">Ошибка загрузки</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-gray-500">Нет транзакций</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                    <th className="py-3 px-2">Тип</th>
                    <th className="py-3 px-2">От кого / Кому</th>
                    <th className="py-3 px-2">Сумма</th>
                    <th className="py-3 px-2">Статус</th>
                    <th className="py-3 px-2">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                      <td className="py-3 px-2">
                        <span className="flex items-center gap-1">
                          <span>{getTransactionIcon(tx.type)}</span>
                          <span className="capitalize">
                            {tx.type === "payment" && "Пополнение"}
                            {tx.type === "payout" && "Выплата"}
                            {tx.type === "transfer" && "Перевод"}
                            {tx.type === "earnings" && "Заработок"}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-700 dark:text-gray-300">
                        {tx.type === "payment" && <span>От: {tx.from_user_name || "Система"}</span>}
                        {tx.type === "payout" && <span>Кому: {tx.to_user_name || "Система"}</span>}
                        {tx.type === "transfer" && (
                          <span>
                            {tx.from_user_name || "—"} → {tx.to_user_name || "—"}
                          </span>
                        )}
                        {tx.type === "earnings" && <span>За задачу: {tx.task_id?.slice(0, 8)}...</span>}
                        {tx.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tx.description}</div>}
                      </td>
                      <td className="py-3 px-2 font-medium">
                        <span
                          className={
                            tx.type === "payment" || tx.type === "earnings"
                              ? "text-green-600"
                              : tx.type === "payout"
                                ? "text-red-600"
                                : "text-blue-600"
                          }
                        >
                          {tx.type === "payout" ? "-" : tx.type === "payment" || tx.type === "earnings" ? "+" : ""}
                          {Number(tx.amount).toFixed(2)} {tx.currency}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`badge ${getStatusBadge(tx.status)}`}>
                          {tx.status === "completed" && "✅ "}
                          {tx.status === "pending" && "⏳ "}
                          {tx.status === "failed" && "❌ "}
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-500 dark:text-gray-400 text-xs">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="btn-secondary disabled:opacity-50"
              >
                ← Назад
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {offset + 1}–{Math.min(offset + limit, total)} из {total}
              </span>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="btn-secondary disabled:opacity-50"
              >
                Дальше →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
