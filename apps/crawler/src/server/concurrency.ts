/** FIFO slots; a cancelled waiter never consumes another request's slot. */
export class CrawlSlots {
  private count = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get active() {
    return this.count;
  }

  async acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.count < this.limit) {
      this.count++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = this.waiting.indexOf(ready);
        if (index !== -1) this.waiting.splice(index, 1);
        reject(signal.reason);
      };
      this.waiting.push(ready);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.count--;
  }
}
