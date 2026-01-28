/* eslint-disable  @typescript-eslint/no-explicit-any */
export async function delay<T>(delayTime: any, value?: T): Promise<void | T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayTime));
}

export async function immediate(value?: any) {
  return new Promise((resolve) => setImmediate(() => resolve(value)));
}
