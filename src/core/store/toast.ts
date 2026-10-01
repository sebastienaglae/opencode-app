import { create } from "zustand";

export type ToastType = "info" | "success" | "error";
export type ToastItem = { id: number; message: string; type: ToastType };

type ToastState = {
  toasts: ToastItem[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
};

let counter = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = "info") => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  show: (message: string, type: ToastType = "info") => useToast.getState().show(message, type),
  success: (message: string) => useToast.getState().show(message, "success"),
  error: (message: string) => useToast.getState().show(message, "error"),
};
