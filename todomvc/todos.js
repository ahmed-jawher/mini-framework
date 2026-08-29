/**
 * todos.js — everything that changes the todo list.
 *
 * Nothing in here touches the DOM. Actions write to the store, the store
 * notifies the framework, and the framework re-renders. That separation is the
 * point: the view is a pure function of the state.
 */

export const FILTERS = {
  "/": "all",
  "/active": "active",
  "/completed": "completed",
};

export const initialState = {
  todos: [],
  editingId: null,
  draft: "",
};

let nextId = Date.now();

function makeId() {
  return String(nextId++);
}

export function createActions(store) {
  const todos = () => store.get("todos", []);

  return {
    add(title) {
      const trimmed = String(title).trim();
      if (!trimmed) return false;
      store.set("todos", [...todos(), { id: makeId(), title: trimmed, completed: false }]);
      return true;
    },

    toggle(id) {
      store.set("todos", todos().map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ));
    },

    toggleAll(completed) {
      store.set("todos", todos().map((todo) => ({ ...todo, completed })));
    },

    remove(id) {
      store.set("todos", todos().filter((todo) => todo.id !== id));
    },

    /** An empty title deletes the todo, as the TodoMVC spec requires. */
    save(id, title) {
      const trimmed = String(title).trim();
      if (!trimmed) {
        this.remove(id);
      } else {
        store.set("todos", todos().map((todo) =>
          todo.id === id ? { ...todo, title: trimmed } : todo
        ));
      }
      store.set("editingId", null);
    },

    startEditing(id) {
      store.set("editingId", id);
    },

    cancelEditing() {
      store.set("editingId", null);
    },

    clearCompleted() {
      store.set("todos", todos().filter((todo) => !todo.completed));
    },
  };
}

/* ── derived values ──────────────────────────────────────────────────────── */

export function visibleTodos(todos, filter) {
  if (filter === "active") return todos.filter((t) => !t.completed);
  if (filter === "completed") return todos.filter((t) => t.completed);
  return todos;
}

export function remainingCount(todos) {
  return todos.reduce((n, t) => (t.completed ? n : n + 1), 0);
}

export function completedCount(todos) {
  return todos.length - remainingCount(todos);
}
