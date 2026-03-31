import { create } from "zustand";
import { Task, TaskCreateRequest, TaskUpdateRequest } from "../types";
import { tasksAPI } from "../services/api";

type TaskState = {
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;

  setSelectedTaskId: (id: string | null) => void;

  createTask: (body: TaskCreateRequest) => Promise<Task>;
  updateTask: (id: string, body: TaskUpdateRequest) => Promise<Task>;
};

export const useTaskStore = create<TaskState>((set) => ({
  selectedTaskId: null,
  loading: false,
  error: null,

  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  createTask: async (body) => {
    set({ loading: true, error: null });
    const task = await tasksAPI.create(body as Record<string, unknown>);
    set({ loading: false });
    return task;
  },

  updateTask: async (id, body) => {
    set({ loading: true, error: null });
    const task = await tasksAPI.update(id, body as Record<string, unknown>);
    set({ loading: false });
    return task;
  },
}));

