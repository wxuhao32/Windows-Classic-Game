// Object Pool for bullets and explosions

export class ObjectPool<T> {
  private pool: T[] = [];
  private active: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 20) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.active.push(obj);
    return obj;
  }

  release(obj: T): void {
    const idx = this.active.indexOf(obj);
    if (idx !== -1) {
      this.active.splice(idx, 1);
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  getActive(): T[] {
    return this.active;
  }

  releaseAll(): void {
    while (this.active.length > 0) {
      const obj = this.active.pop()!;
      this.reset(obj);
      this.pool.push(obj);
    }
  }
}
