/**
 * state.js — state management.
 *
 * One store holds the whole application state. Any part of the app can read
 * it, write it, and subscribe to it, so several routes can share the same data
 * without passing anything between them. Writes are announced to subscribers;
 * the app subscribes once and re-renders, which is the inversion of control
 * that makes this a framework rather than a library: you change data, the
 * framework decides what the screen should look like.
 *
 * State is treated as immutable — every write produces a new top-level object,
 * so `oldState !== newState` is a reliable "something changed" signal.
 */

export class Store {
  constructor(initialState = {}) {
    this._state = { ...initialState };
    this._subscribers = new Set();
  }

  /** The whole state object (treat as read-only). */
  getState() {
    return this._state;
  }

  /** get("todos", []) — the value at `key`, or `fallback` if it is not set. */
  get(key, fallback) {
    if (key === undefined) return this._state;
    const value = this._state[key];
    return value === undefined ? fallback : value;
  }

  /**
   * set("filter", "active")
   *
   * `value` may also be a function, which receives the current value and
   * returns the new one:
   *
   *   store.set("count", n => n + 1)
   *
   * Prefer that form whenever the new value depends on the old one. Renders
   * are batched, so a handler closing over a value read at render time can
   * fire twice before the next render and compute from a stale copy; the
   * function form always sees what is in the store right now.
   */
  set(key, value) {
    const resolved = typeof value === "function" ? value(this._state[key]) : value;
    if (this._state[key] === resolved) return this._state;
    return this._commit({ ...this._state, [key]: resolved });
  }

  /**
   * Merge several keys at once, in a single notification:
   *   store.setState({ editingId: null, draft: "" })
   */
  setState(patch) {
    let changed = false;
    for (const key of Object.keys(patch)) {
      if (this._state[key] !== patch[key]) { changed = true; break; }
    }
    if (!changed) return this._state;
    return this._commit({ ...this._state, ...patch });
  }

  /**
   * subscribe(listener) — listener(state) after every write. Returns an
   * unsubscribe function; call it in `onUnmount` to avoid leaks.
   */
  subscribe(listener) {
    this._subscribers.add(listener);
    return () => this._subscribers.delete(listener);
  }

  /**
   * Mirror the store into localStorage under `key`. Existing saved state is
   * loaded immediately (shallow-merged over the current state).
   *   store.persist("todos-mf", { pick: ["todos"] })
   */
  persist(key, { pick = null } = {}) {
    let saved = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch (_) { /* corrupt or unavailable storage: start fresh */ }

    if (saved && typeof saved === "object") {
      this._state = { ...this._state, ...saved };
    }

    const save = (state) => {
      try {
        const payload = pick
          ? pick.reduce((acc, k) => (acc[k] = state[k], acc), {})
          : state;
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (_) { /* quota or private mode: persistence is best-effort */ }
    };

    save(this._state);
    return this.subscribe(save);
  }

  _commit(next) {
    this._state = next;
    // Copy the set: a listener may unsubscribe while we are notifying.
    for (const listener of Array.from(this._subscribers)) listener(next);
    return next;
  }
}

export function createStore(initialState) {
  return new Store(initialState);
}
