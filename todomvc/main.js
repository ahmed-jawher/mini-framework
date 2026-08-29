/**
 * TodoMVC, written with this framework.
 *
 * Every feature the brief asks for shows up here: the virtual DOM (`h`),
 * routed filters, one shared store, and the custom event system (`onClick`,
 * `onKey`, and no addEventListener anywhere).
 */

import { createApp, Component, h, onKey } from "../framework/index.js";
import {
  FILTERS,
  initialState,
  createActions,
  visibleTodos,
  remainingCount,
  completedCount,
} from "./todos.js";

const app = createApp({ root: "#app", state: initialState, mode: "hash" });

// The list survives a reload; `pick` keeps transient UI state out of storage.
app.store.persist("mini-framework-todomvc", { pick: ["todos"] });

const actions = createActions(app.store);

class TodoApp extends Component {
  onMount() {
    // A keybinding registered through the framework, not addEventListener.
    // The returned disposer is collected automatically on unmount.
    this.onCleanup(onKey("Escape", () => actions.cancelEditing(), { allowInInput: true }));
  }

  get filter() {
    return FILTERS[this.context.path] || "all";
  }

  render() {
    const todos = this.getState("todos", []);
    const remaining = remainingCount(todos);
    const done = completedCount(todos);
    const visible = visibleTodos(todos, this.filter);

    return h("section", { class: "todoapp" }, [
      this.renderHeader(),
      todos.length ? this.renderMain(visible, remaining) : null,
      todos.length ? this.renderFooter(remaining, done) : null,
    ]);
  }

  renderHeader() {
    return h("header", { class: "header" }, [
      h("h1", {}, ["todos"]),
      h("input", {
        class: "new-todo",
        placeholder: "What needs to be done?",
        autofocus: true,
        value: this.getState("draft", ""),
        onInput: (event) => app.store.set("draft", event.target.value),
        onKeydown: (event) => {
          if (event.key !== "Enter") return;
          if (actions.add(event.target.value)) app.store.set("draft", "");
        },
      }),
    ]);
  }

  renderMain(visible, remaining) {
    return h("main", { class: "main" }, [
      h("input", {
        id: "toggle-all",
        class: "toggle-all",
        type: "checkbox",
        checked: remaining === 0,
        onChange: (event) => actions.toggleAll(event.target.checked),
      }),
      h("label", { for: "toggle-all" }, ["Mark all as complete"]),
      h("ul", { class: "todo-list" }, visible.map((todo) => this.renderTodo(todo))),
    ]);
  }

  renderTodo(todo) {
    const editing = this.getState("editingId") === todo.id;

    // `key` lets the virtual DOM match this <li> to the same DOM node across
    // renders, so reordering or deleting never rebuilds the rest of the list.
    return h("li", {
      key: todo.id,
      class: { completed: todo.completed, editing },
    }, [
      h("div", { class: "view" }, [
        h("input", {
          class: "toggle",
          type: "checkbox",
          checked: todo.completed,
          onChange: () => actions.toggle(todo.id),
        }),
        h("label", { onDblclick: () => actions.startEditing(todo.id) }, [todo.title]),
        h("button", { class: "destroy", onClick: () => actions.remove(todo.id) }),
      ]),
      editing
        ? h("input", {
            class: "edit",
            value: todo.title,
            // Refs run after the node is live, so focus() actually takes. The
            // guard matters because a re-render while editing would otherwise
            // re-run this and yank the caret back to the end.
            ref: (input) => {
              if (document.activeElement === input) return;
              input.focus();
              input.setSelectionRange(input.value.length, input.value.length);
            },
            onBlur: (event) => actions.save(todo.id, event.target.value),
            onKeydown: (event) => {
              if (event.key === "Enter") actions.save(todo.id, event.target.value);
              if (event.key === "Escape") { event.target.value = todo.title; actions.cancelEditing(); }
            },
          })
        : null,
    ]);
  }

  renderFooter(remaining, done) {
    return h("footer", { class: "footer" }, [
      h("span", { class: "todo-count" }, [
        h("strong", {}, [String(remaining)]),
        ` item${remaining === 1 ? "" : "s"} left`,
      ]),
      h("ul", { class: "filters" }, [
        this.renderFilter("/", "All"),
        this.renderFilter("/active", "Active"),
        this.renderFilter("/completed", "Completed"),
      ]),
      done
        ? h("button", { class: "clear-completed", onClick: () => actions.clearCompleted() }, ["Clear completed"])
        : null,
    ]);
  }

  renderFilter(path, label) {
    return h("li", {}, [
      h("a", {
        href: this.router.href(path),
        class: this.context.path === path ? "selected" : null,
      }, [label]),
    ]);
  }
}

// The same component serves all three filters; the route decides which todos
// are visible, so the URL and the state can never disagree.
app.route("/", TodoApp);
app.route("/active", TodoApp);
app.route("/completed", TodoApp);

app.start();

// Handy while exploring in the console: `window.app.getState("todos")`.
window.app = app;

export { app };
