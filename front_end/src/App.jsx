import { useEffect, useMemo, useState } from "react";

const themes = {
  default: { className: "theme-default", label: "Default" },
  cozy: { className: "theme-cozy", label: "Cozy" },
  minimal: { className: "theme-minimal", label: "Minimalist" },
  space: { className: "theme-space", label: "Space" }
};

const views = ["front", "lists", "detail"];

const API_BASE = "http://localhost:8000";

const api = {
  url: (path) => `${API_BASE}${path}`,
  json: async (path, options = {}) => {
    const res = await fetch(path, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.json();
  },
  text: async (path, options = {}) => {
    const res = await fetch(path, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.text();
  }
};

export default function App() {
  const [theme, setTheme] = useState("default");
  const [view, setView] = useState("front");
  const [settingsReady, setSettingsReady] = useState(false);
  const [todos, setTodos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState("Click \"AI summary\" to plan your day.");
  const [recommendations, setRecommendations] = useState("Generate ideas related to the selected task.");
  const [relatedTodos, setRelatedTodos] = useState([]);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const themeClass = themes[theme]?.className || themes.default.className;
    document.body.className = themeClass;
  }, [theme]);

  useEffect(() => {
    loadSettings();
    loadTodos();
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    saveSettings(theme, view);
  }, [theme, view, settingsReady]);

  useEffect(() => {
    loadTodos();
  }, [view]);

  const selectedTodo = useMemo(
    () => todos.find((t) => t.id === selected?.id) || selected,
    [todos, selected]
  );

  const getTaskNameById = (id) => todos.find((t) => t.id === id)?.text || null;

  async function loadSettings() {
    try {
      const data = await api.json(api.url("/settings"));
      setTheme(data.theme || "default");
      setView(data.view || "front");
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setSettingsReady(true);
    }
  }

  async function saveSettings(nextTheme, nextView) {
    try {
      await api.json(api.url("/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme, view: nextView })
      });
    } catch (err) {
      console.error("Failed to save settings", err);
    }
  }

  const changeView = (nextView) => {
    setView(nextView);
  };

  async function loadTodos() {
    try {
      const data = await api.json(api.url("/todo_list"));
      setTodos(data);
    } catch (err) {
      setTodos([]);
      console.error(err);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const form = e.target;
    const text = form.newText.value.trim();
    if (!text) return;
    const relatedIdValue = form.newRelatedSelect.value;
    const params = new URLSearchParams({ todo_text: text });
    if (relatedIdValue) params.append("related_id", relatedIdValue);
    try {
      await api.json(api.url(`/create_a_todo?${params.toString()}`), { method: "POST" });
      form.reset();
      await loadTodos();
    } catch (err) {
      alert(`Could not create todo: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    try {
      await api.json(api.url(`/delete_a_todo/${id}`), { method: "DELETE" });
      if (selected?.id === id) {
        setSelected(null);
        changeView("lists");
      }
      await loadTodos();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function selectTodo(id) {
    try {
      const todo = await api.json(api.url(`/fetch_a_todo/${id}`));
      setSelected(todo);
      setRecommendations("Generate ideas related to the selected task.");
      setRelatedTodos([]);
      changeView("detail");
    } catch (err) {
      alert(`Unable to load todo: ${err.message}`);
    }
  }

  async function saveText(text) {
    if (!selectedTodo) return;
    if (!text.trim()) {
      alert("Text cannot be empty.");
      return;
    }
    const params = new URLSearchParams({ id: selectedTodo.id, text });
    try {
      await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      await selectTodo(selectedTodo.id);
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  }

  async function saveRelated(relatedIdValue) {
    if (!selectedTodo) return;
    const params = new URLSearchParams({ id: selectedTodo.id });
    if (relatedIdValue) params.append("related_id", relatedIdValue);
    try {
      await api.json(api.url(`/alter_related_todos?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      await selectTodo(selectedTodo.id);
    } catch (err) {
      alert(`Unable to update relationship: ${err.message}`);
    }
  }

  async function loadRelated() {
    if (!selectedTodo) return;
    try {
      const data = await api.json(api.url(`/fetch_related_todos/${selectedTodo.id}`));
      setRelatedTodos(data.related || []);
    } catch (err) {
      setRelatedTodos([]);
      alert(`Failed to load related: ${err.message}`);
    }
  }

  async function loadRecommendations() {
    if (!selectedTodo) return;
    setRecommendations("Thinking...");
    try {
      const recs = await api.json(api.url(`/reccomended_todos/${selectedTodo.id}`), { method: "POST" });
      const lines = recs.todos?.map((t) => `• ${t.text}`).join("\n") || "No recommendations returned.";
      setRecommendations(lines);
    } catch (err) {
      setRecommendations(`Failed to get recommendations: ${err.message}`);
    }
  }

  async function summariseTodos() {
    setSummary("Summarising...");
    try {
      const text = await api.text(api.url("/summarise_todos"), { method: "POST" });
      setSummary(text);
    } catch (err) {
      setSummary(`Unable to summarise: ${err.message}`);
    }
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1>Menu</h1>
          <p>Select a vibe and manage tasks without losing focus.</p>
          <nav className="nav-inline">
            {views.map((v) => (
              <button
                key={v}
                className={`nav-button ${view === v ? "active" : ""}`}
                onClick={() => changeView(v)}
              >
                {v === "front" ? "Main Menu" : v === "lists" ? "My Lists" : "Individual List"}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <button
        className="settings-launcher"
        onClick={() => setShowSettings(true)}
        aria-label="Open settings"
        title="Settings"
      >
        <GearIcon />
      </button>

      <main>
        <section className={view === "front" ? "active" : ""} id="front">
          <div className="hero">
            <div>
              <h2>Pick a theme, keep momentum.</h2>
              <p>The experience adapts across every page—front, lists, and individual items—so your flow and task outlines stay consistent.</p>
              <div className="cta-buttons">
                <button className="button" onClick={() => changeView("lists")}>Open my lists</button>
                <button className="button secondary" onClick={summariseTodos}>AI summary</button>
              </div>
              <div className="panel-grid">
                <div className="panel">
                  <h3>Consistent visuals</h3>
                  <p>Once you choose a theme it persists everywhere until you switch.</p>
                </div>
                <div className="panel">
                  <h3>Task outlines</h3>
                  <p>Cards use theme-colored borders to keep your list readable at a glance.</p>
                </div>
              </div>
            </div>
            <ThemeScene theme={theme} />
          </div>
          <div className="status">{summary}</div>
        </section>

        <section className={view === "lists" ? "active" : ""} id="lists">
          <div className="panel">
            <h3>Task overview</h3>
            <p>Browse all tasks. Use Individual List to create or edit tasks and relationships.</p>
          </div>
          <div className="list">
            {todos.length === 0 && <div className="status">No todos yet. Create one to get started.</div>}
            {todos.map((todo) => (
              <article key={todo.id} className="task-card">
                <div className="task-meta">
                  <span className="badge">Task</span>
                  <span>{todo.related_id ? `Related: ${getTaskNameById(todo.related_id) || "Unknown"}` : "No relation"}</span>
                </div>
                <div>{todo.text}</div>
                <div className="actions">
                  <button className="button secondary" onClick={() => selectTodo(todo.id)}>Open</button>
                  <button className="ghost" onClick={() => setDeletePrompt(todo)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={view === "detail" ? "active" : ""} id="detail">
          <div className="panel">
            <h3>Create a todo</h3>
            <form id="createForm" onSubmit={handleCreate}>
              <input name="newText" type="text" placeholder="Task text" required />
              <select name="newRelatedSelect" defaultValue="">
                <option value="">No related task</option>
                {todos.map((todo) => (
                  <option key={todo.id} value={todo.id}>
                    {todo.text}
                  </option>
                ))}
              </select>
              <button type="submit" className="button">Add task</button>
            </form>
          </div>
          <div className="split">
            <div>
              <h3>Selected todo</h3>
              {!selectedTodo && <div className="status">Pick a task from "My Lists" to view details.</div>}
              {selectedTodo && (
                <div className="panel-grid">
                  <div className="panel">
                    <h3>{selectedTodo.text}</h3>
                    <p>{selectedTodo.related_id ? `Related to ${getTaskNameById(selectedTodo.related_id) || "Unknown"}` : "Related: none"}</p>
                    <div className="actions">
                      <button className="button secondary" onClick={loadRecommendations}>Recommendations</button>
                      <button className="button secondary" onClick={loadRelated}>Fetch related</button>
                    </div>
                  </div>
                  <EditPanel title="Update text" label="New text" defaultValue={selectedTodo.text} onSave={saveText} />
                  <RelatedPicker
                    title="Update related task"
                    label="Pick a related task (optional)"
                    todos={todos}
                    currentId={selectedTodo.related_id || ""}
                    onSave={saveRelated}
                    excludeId={selectedTodo.id}
                  />
                </div>
              )}
            </div>
            <div className="panel-grid">
              <div className="panel">
                <h3>Recommendations</h3>
                <p className="multiline">{recommendations}</p>
              </div>
              <div className="panel">
                <h3>Related tasks</h3>
                <div className="list">
                  {relatedTodos.length === 0 && <div className="status">No related todos yet.</div>}
                  {relatedTodos.map((item) => (
                    <article key={item.id} className="task-card">
                      <div className="task-meta">
                        <span className="badge">Task</span>
                        <span>{item.related_id ? `Related: ${getTaskNameById(item.related_id) || "Unknown"}` : "No relation"}</span>
                      </div>
                      <div>{item.text}</div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        theme={theme}
        setTheme={setTheme}
      />

      <DeleteModal
        todo={deletePrompt}
        onConfirm={async () => {
          if (deletePrompt) await handleDelete(deletePrompt.id);
          setDeletePrompt(null);
        }}
        onCancel={() => setDeletePrompt(null)}
      />
    </div>
  );
}

function EditPanel({ title, label, defaultValue, onSave, type = "text" }) {
  const [value, setValue] = useState(defaultValue || "");

  useEffect(() => {
    setValue(defaultValue || "");
  }, [defaultValue]);

  return (
    <div className="panel">
      <h3>{title}</h3>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={label} type={type} />
      <button className="button" onClick={() => onSave(value)}>Save changes</button>
    </div>
  );
}

function RelatedPicker({ title, label, todos, currentId, onSave, excludeId }) {
  const [value, setValue] = useState(currentId ? String(currentId) : "");

  useEffect(() => {
    setValue(currentId ? String(currentId) : "");
  }, [currentId]);

  return (
    <div className="panel">
      <h3>{title}</h3>
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">No related task</option>
        {todos
          .filter((t) => t.id !== excludeId)
          .map((todo) => (
            <option key={todo.id} value={todo.id}>
              {todo.text}
            </option>
          ))}
      </select>
      <button className="button" onClick={() => onSave(value)}>Save changes</button>
    </div>
  );
}

function SettingsPanel({ open, onClose, theme, setTheme }) {
  if (!open) return null;
  const [openSelect, setOpenSelect] = useState(false);
  const previews = {
    default: { bg: "#f5f8ff", border: "#1f4bff" },
    cozy: { bg: "#fff3e3", border: "#c47c4a" },
    minimal: { bg: "#f7f7f8", border: "#1f2937" },
    space: { bg: "#0f1429", border: "#6ac7ff" }
  };

  const chooseTheme = (key) => {
    setTheme(key);
  };

  return (
    <div className="settings-panel">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div className="settings-content" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-header">
          <div className="settings-spacer" />
          <h3 id="settings-title" className="settings-title">Settings</h3>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>
        <p className="muted">Choose a theme. Themes apply everywhere and color your task outlines.</p>
        <div className="theme-dropdown">
          <button className="theme-select" onClick={() => setOpenSelect((o) => !o)} aria-haspopup="listbox" aria-expanded={openSelect}>
            <span>Theme</span>
            <span className="current-theme-label">{themes[theme]?.label}</span>
          </button>
          {openSelect && (
            <div className="theme-options" role="listbox">
              {Object.entries(themes).map(([key, info]) => (
                <button
                  key={key}
                  className={`theme-option ${theme === key ? "active" : ""}`}
                  role="option"
                  onClick={() => chooseTheme(key)}
                >
                  <span
                    className="theme-chip"
                    style={{ background: previews[key]?.bg, borderColor: previews[key]?.border }}
                  />
                  <span>{info.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThemeScene({ theme }) {
  return (
    <div className="scene" aria-hidden="true">
      <div className={`layer default-visual ${theme === "default" ? "active" : ""}`}></div>
      <div className={`layer cozy-visual ${theme === "cozy" ? "active" : ""}`}>
        <div className="window"></div>
        <div className="bookshelf"><div className="book"></div></div>
        <div className="desk"></div>
        <div className="chair"></div>
        <div className="notebook"></div>
        <div className="pen"></div>
        <div className="laptop"></div>
        <div className="plant"></div>
        <div className="calculator"></div>
      </div>
      <div className={`layer minimal-visual ${theme === "minimal" ? "active" : ""}`}></div>
      <div className={`layer space-visual ${theme === "space" ? "active" : ""}`}>
        <div className="stars"></div>
        <div className="planet"></div>
        <div className="planet ringed"></div>
        <div className="shooting-star"></div>
        <div className="astronaut"></div>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg className="gear-icon" viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path
        d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm8.2 3.9-1.08-.43a7.2 7.2 0 0 0 0-1.54l1.08-.43a.5.5 0 0 0 .28-.61l-.9-2.46a.5.5 0 0 0-.63-.28l-1.11.44a7.3 7.3 0 0 0-1.36-.98l-.17-1.12a.5.5 0 0 0-.49-.42h-2.9a.5.5 0 0 0-.49.42l-.17 1.12a7.3 7.3 0 0 0-1.36.98l-1.11-.44a.5.5 0 0 0-.63.28l-.9 2.46a.5.5 0 0 0 .28.61l1.08.43c-.05.26-.07.52-.07.77 0 .25.02.51.07.77l-1.08.43a.5.5 0 0 0-.28.61l.9 2.46c.1.25.38.38.63.28l1.11-.44c.42.39.88.72 1.36.98l.17 1.12c.04.24.24.42.49.42h2.9c.25 0 .45-.18.49-.42l.17-1.12c.48-.26.94-.59 1.36-.98l1.11.44c.25.1.53-.03.63-.28l.9-2.46a.5.5 0 0 0-.28-.61Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteModal({ todo, onConfirm, onCancel }) {
  if (!todo) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onCancel} aria-hidden="true"></div>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h3 id="delete-title">Delete task?</h3>
        <p>Are you sure you want to delete “{todo.text}”?</p>
        <div className="modal-actions">
          <button className="button secondary" onClick={onCancel}>No</button>
          <button className="button" onClick={onConfirm}>Yes, delete</button>
        </div>
      </div>
    </div>
  );
}
