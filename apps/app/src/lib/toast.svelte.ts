export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  /** One button beside the message, such as Undo. */
  action?: { label: string; run: () => void };
}

let counter = 0;

class Toasts {
  items = $state<Toast[]>([]);

  show(message: string, tone: Toast["tone"] = "success", ms = 4200, action?: Toast["action"]): void {
    const id = ++counter;
    this.items = [...this.items, { id, message, tone, action }];
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
