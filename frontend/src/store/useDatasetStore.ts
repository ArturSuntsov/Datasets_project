import { create } from "zustand";
import { Dataset, DatasetCreateRequest, DatasetUpdateRequest } from "../types";
import { datasetsAPI } from "../services/api";

type DatasetState = {
  selectedDatasetId: string | null;
  loading: boolean;
  error: string | null;

  setSelectedDatasetId: (id: string | null) => void;

  createDataset: (body: DatasetCreateRequest) => Promise<Dataset>;
  updateDataset: (id: string, body: DatasetUpdateRequest) => Promise<Dataset>;
  fetchDatasetDetail: (id: string) => Promise<Dataset>;
  deleteDataset: (id: string) => Promise<void>;
};

export const useDatasetStore = create<DatasetState>((set) => ({
  selectedDatasetId: null,
  loading: false,
  error: null,

  setSelectedDatasetId: (id) => set({ selectedDatasetId: id }),

  createDataset: async (body) => {
    set({ loading: true, error: null });
    const dataset = await datasetsAPI.create(body as unknown as Record<string, unknown>);
    set({ loading: false });
    return dataset;
  },

  updateDataset: async (id, body) => {
    set({ loading: true, error: null });
    const dataset = await datasetsAPI.update(id, body as Record<string, unknown>);
    set({ loading: false });
    return dataset;
  },

  fetchDatasetDetail: async (id) => {
    set({ loading: true, error: null });
    const dataset = await datasetsAPI.detail(id);
    set({ loading: false });
    return dataset;
  },

  deleteDataset: async (id) => {
    set({ loading: true, error: null });
    await datasetsAPI.remove(id);
    set({ loading: false });
  },
}));

