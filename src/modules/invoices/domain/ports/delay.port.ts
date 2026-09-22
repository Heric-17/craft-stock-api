export const DELAY = Symbol('DELAY');

/**
 * Waiting, as a dependency. The import flow backs off between attempts at the
 * state portal, and a test of that flow must not actually sit still for the
 * backoff — it substitutes an implementation that returns immediately and
 * records what it was asked to wait.
 */
export interface Delay {
  wait(milliseconds: number): Promise<void>;
}
