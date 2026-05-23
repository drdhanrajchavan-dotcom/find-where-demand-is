import type { SSEEvent } from "./types";

export class SSEStream {
  private readonly encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  public readonly readable: ReadableStream<Uint8Array>;

  constructor() {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.controller = null;
      },
    });
  }

  emit(event: SSEEvent): void {
    if (!this.controller) return;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    try {
      this.controller.enqueue(this.encoder.encode(payload));
    } catch {
      this.controller = null;
    }
  }

  close(): void {
    if (!this.controller) return;
    try {
      this.controller.close();
    } catch {
      // already closed
    }
    this.controller = null;
  }
}

export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
