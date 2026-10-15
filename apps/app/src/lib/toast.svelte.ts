export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
}

let counter = 0;

class Toasts {
  items = $state<Toast[]>([]);

  show(message: string, tone: Toast["tone"] = "success", ms = 4200): void {
    const id = ++counter;
    this.items = [...this.items, { id, message, tone }];
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
