/**
 * Serializes tasks sharing the same lock name, within one coordinator
 * instance — an async mutex per key. Unlocked tasks (`lockName` undefined)
 * run immediately, uncoordinated (flow-model.md §7: opt-in only).
 */
export class LockCoordinator {
  private readonly tail = new Map<string, Promise<void>>();

  async run<T>(lockName: string | undefined, task: () => Promise<T>): Promise<T> {
    if (!lockName) {
      return task();
    }

    const previous = this.tail.get(lockName) ?? Promise.resolve();
    const previousSettled = previous.then(
      () => undefined,
      () => undefined,
    );

    let releaseNext!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    this.tail.set(
      lockName,
      previousSettled.then(() => next),
    );

    await previousSettled;
    try {
      return await task();
    } finally {
      releaseNext();
    }
  }
}
