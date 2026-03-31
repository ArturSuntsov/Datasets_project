import { create } from "zustand";
import { Transaction, TransactionFilters } from "../types";
import { financeAPI } from "../services/api";

type FinanceState = {
  loading: boolean;
  error: string | null;
  transactions: Transaction[];

  fetchTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>;
};

export const useFinanceStore = create<FinanceState>((set) => ({
  loading: false,
  error: null,
  transactions: [],

  fetchTransactions: async (filters) => {
    set({ loading: true, error: null });
    const res = await financeAPI.transactions(filters ? { limit: filters.limit, offset: filters.offset, status: filters.status } : undefined);
    set({ transactions: res.items, loading: false });
    return res.items;
  },
}));

