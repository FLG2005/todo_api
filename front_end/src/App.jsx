import { useEffect, useMemo, useState } from "react";

const themes = {
  default: { className: "theme-default", label: "Default" },
  cozy: { className: "theme-cozy", label: "Cozy" },
  minimal: { className: "theme-minimal", label: "Minimalist" },
  space: { className: "theme-space", label: "Space" }
};

const themePreviews = {
  default: { bg: "#f5f8ff", border: "#1f4bff" },
  cozy: { bg: "#fff3e3", border: "#c47c4a" },
  minimal: { bg: "#f7f7f8", border: "#1f2937" },
  space: { bg: "#0f1429", border: "#6ac7ff" }
};

const views = ["front", "lists", "detail"];
const viewLabels = {
  front: "Home",
  lists: "My Lists",
  detail: "Individual List"
};

const API_BASE = "http://localhost:8000";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric"
});

function generateDateOptions(days = 30) {
  const today = new Date();
  return Array.from({ length: days }, (_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() + idx);
    const value = d.toISOString().slice(0, 10);
    return { value, label: dateFormatter.format(d) };
  });
}

function generateTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      options.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  return options;
}

function splitDeadline(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

function formatDeadline(iso) {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No deadline";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} • ${time}`;
}

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
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [todos, setTodos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState("Select a list to view its summary.");
  const [listSummaries, setListSummaries] = useState({});
  const [recommendations, setRecommendations] = useState("Generate ideas related to the selected task.");
  const [relatedTodos, setRelatedTodos] = useState([]);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [listPrompt, setListPrompt] = useState(null);
  const [createDeadline, setCreateDeadline] = useState({ date: "", time: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsHoverOpen, setSettingsHoverOpen] = useState(false);
  const [closeMenuTimeout, setCloseMenuTimeout] = useState(null);
  const [closeSettingsTimeout, setCloseSettingsTimeout] = useState(null);
  const [settingsThemeOpen, setSettingsThemeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (closeMenuTimeout) clearTimeout(closeMenuTimeout);
      if (closeSettingsTimeout) clearTimeout(closeSettingsTimeout);
    };
  }, [closeMenuTimeout, closeSettingsTimeout]);

  useEffect(() => {
    const themeClass = themes[theme]?.className || themes.default.className;
    document.body.className = themeClass;
  }, [theme]);

  useEffect(() => {
    if (selected && selected.list_id && selected.list_id !== selectedListId) {
      setSelected(null);
    }
  }, [selectedListId, selected]);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    saveSettings(theme, view, selectedListId);
  }, [theme, view, selectedListId, settingsReady]);

  useEffect(() => {
    if (selectedListId) {
      loadTodos();
      updateSummaryText(selectedListId);
    }
  }, [view, selectedListId]);

  const selectedTodo = useMemo(
    () => todos.find((t) => t.id === selected?.id) || selected,
    [todos, selected]
  );

  const currentList = useMemo(
    () => lists.find((l) => l.id === selectedListId) || null,
    [lists, selectedListId]
  );

  const dateOptions = useMemo(() => generateDateOptions(45), []);
  const timeOptions = useMemo(() => generateTimeOptions(), []);

  const getTaskNameById = (id) => todos.find((t) => t.id === id)?.text || null;

  async function loadSettings() {
    try {
      const data = await api.json(api.url("/settings"));
      setTheme(data.theme || "default");
      setView(data.view || "front");
      if (data.selected_list_id) {
        setSelectedListId(data.selected_list_id);
      }
    } catch (err) {
      console.error("Failed to load settings", err);
    } finally {
      setSettingsReady(true);
      loadLists();
    }
  }

  async function saveSettings(nextTheme, nextView, nextSelectedListId) {
    try {
      await api.json(api.url("/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme, view: nextView, selected_list_id: nextSelectedListId })
      });
    } catch (err) {
      console.error("Failed to save settings", err);
    }
  }

  const changeView = (nextView) => {
    setView(nextView);
  };

  async function loadLists() {
    try {
      const data = await api.json(api.url("/lists"));
      setLists(data);
      if (data.length > 0) {
        const exists = selectedListId && data.some((l) => l.id === selectedListId);
        const desired = exists ? selectedListId : data[0].id;
        setSelectedListId(desired);
      } else {
        setSelectedListId(null);
      }
    } catch (err) {
      console.error("Failed to load lists", err);
    }
  }

  async function loadTodos() {
    if (!selectedListId) {
      setTodos([]);
      return;
    }
    try {
      const params = new URLSearchParams({ list_id: selectedListId });
      const data = await api.json(api.url(`/todo_list?${params.toString()}`));
      setTodos(data);
      updateSummaryText(selectedListId);
    } catch (err) {
      setTodos([]);
      console.error(err);
    }
  }

  async function createList(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.listName.value.trim();
    if (!name) return;
    try {
      await api.json(api.url(`/lists?name=${encodeURIComponent(name)}`), { method: "POST" });
      form.reset();
      await loadLists();
    } catch (err) {
      alert(`Could not create list: ${err.message}`);
    }
  }

  async function renameList(id, name) {
    if (!name.trim()) return;
    try {
      await api.json(api.url(`/lists/${id}?name=${encodeURIComponent(name.trim())}`), { method: "PUT" });
      await loadLists();
      if (selectedListId === id) {
        setSelectedListId(id);
      }
    } catch (err) {
      alert(`Failed to rename list: ${err.message}`);
    }
  }

  async function removeList(id) {
    try {
      await api.json(api.url(`/lists/${id}`), { method: "DELETE" });
      if (selectedListId === id) {
        const remaining = lists.filter((l) => l.id !== id);
        const next = remaining[0]?.id || null;
        setSelectedListId(next);
      }
      await loadLists();
      await loadTodos();
    } catch (err) {
      alert(`Failed to delete list: ${err.message}`);
    }
  }

  const selectList = (id) => {
    setSelectedListId(id);
    changeView("detail");
    updateSummaryText(id);
  };

  async function handleCreate(e) {
    e.preventDefault();
    if (!selectedListId) {
      alert("Please select or create a list first.");
      return;
    }
    const form = e.target;
    const text = form.newText.value.trim();
    if (!text) return;
    const relatedIdValue = form.newRelatedSelect.value;
    let deadlineParam = null;
    if (createDeadline.date && createDeadline.time) {
      deadlineParam = `${createDeadline.date}T${createDeadline.time}:00`;
    }
    const params = new URLSearchParams({ todo_text: text, list_id: selectedListId });
    if (relatedIdValue) params.append("related_id", relatedIdValue);
    if (deadlineParam) params.append("deadline", deadlineParam);
    try {
      await api.json(api.url(`/create_a_todo?${params.toString()}`), { method: "POST" });
      form.reset();
      setCreateDeadline({ date: "", time: "" });
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

  async function toggleComplete(id, completed) {
    try {
      const params = new URLSearchParams({ id, completed });
      await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      if (selectedTodo?.id === id) {
        await selectTodo(id);
      }
    } catch (err) {
      console.error("Unable to update task", err);
    }
  }

  async function selectTodo(id) {
    try {
      const todo = await api.json(api.url(`/fetch_a_todo/${id}`));
      if (todo.list_id && todo.list_id !== selectedListId) {
        setSelectedListId(todo.list_id);
      }
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

  async function saveDeadline(deadlineValue) {
    if (!selectedTodo) return;
    const params = new URLSearchParams({ id: selectedTodo.id });
    if (deadlineValue) params.append("deadline", deadlineValue);
    else params.append("deadline", "");
    try {
      await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      await selectTodo(selectedTodo.id);
    } catch (err) {
      alert(`Unable to update deadline: ${err.message}`);
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

  async function summariseList(listId) {
    setListSummaries((prev) => ({ ...prev, [listId]: "Summarising..." }));
    try {
      const text = await api.text(api.url(`/summarise_todos?list_id=${listId}`), { method: "POST" });
      setListSummaries((prev) => ({ ...prev, [listId]: text }));
      if (listId === selectedListId) {
        setSummary(text);
      }
    } catch (err) {
      const msg = `Unable to summarise: ${err.message}`;
      setListSummaries((prev) => ({ ...prev, [listId]: msg }));
      if (listId === selectedListId) {
        setSummary(msg);
      }
    }
  }

  const updateSummaryText = (listId) => {
    if (listId && listSummaries[listId]) {
      setSummary(listSummaries[listId]);
    }
  };

  return (
    <div className="app">
      <div className="layout">
        <div className="content-area">
          <div className="launcher-stack">
            <div
              className="launcher-item"
              onMouseEnter={() => {
                if (closeMenuTimeout) clearTimeout(closeMenuTimeout);
                setMenuOpen(true);
              }}
              onMouseLeave={() => {
                const timeout = setTimeout(() => setMenuOpen(false), 120);
                setCloseMenuTimeout(timeout);
              }}
            >
              <button
                className="settings-launcher-rect"
                aria-label="Open menu"
                title="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                Menu
              </button>
              {menuOpen && (
                <div className="menu-dropdown">
                  <button
                    className={`nav-button full ${view === "front" ? "active" : ""}`}
                    onClick={() => {
                      changeView("front");
                      setMenuOpen(true);
                    }}
                  >
                    Home
                  </button>
                  <button
                    className={`nav-button full ${view === "lists" ? "active" : ""}`}
                    onClick={() => {
                      changeView("lists");
                      setMenuOpen(true);
                    }}
                  >
                    My Lists
                  </button>
                  <button
                    className={`nav-button full ${view === "detail" ? "active" : ""}`}
                    onClick={() => {
                      changeView("detail");
                      setMenuOpen(true);
                    }}
                  >
                    Individual list
                  </button>
                </div>
              )}
            </div>

            <div
              className="launcher-item"
              onMouseEnter={() => {
                if (closeSettingsTimeout) clearTimeout(closeSettingsTimeout);
                setSettingsHoverOpen(true);
              }}
              onMouseLeave={() => {
                setSettingsThemeOpen(false);
                const timeout = setTimeout(() => setSettingsHoverOpen(false), 120);
                setCloseSettingsTimeout(timeout);
              }}
            >
              <button
                className="settings-launcher"
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                title="Settings"
              >
                <GearIcon />
              </button>
              {settingsHoverOpen && (
                <div className="settings-dropdown">
                  <div className="dropdown-section">
                    <div className="dropdown-label">Theme</div>
                    <div className="dropdown-theme-select">
                      <button
                        className="dropdown-theme-toggle"
                        onClick={() => setSettingsThemeOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={settingsThemeOpen}
                      >
                        <span className="dropdown-theme-label">Theme</span>
                        <span className="dropdown-theme-current">{themes[theme]?.label}</span>
                      </button>
                      {settingsThemeOpen && (
                        <div className="dropdown-theme-options" role="listbox">
                          {Object.entries(themes).map(([key, info]) => (
                            <button
                              key={key}
                              className={`dropdown-theme-option ${theme === key ? "active" : ""}`}
                              onClick={() => {
                                setTheme(key);
                              }}
                              role="option"
                            >
                              <span
                                className="theme-chip"
                                style={{ background: themePreviews[key]?.bg, borderColor: themePreviews[key]?.border }}
                              />
                              <span>{info.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button className="nav-button full" onClick={() => setShowSettings(true)}>
                    Open settings
                  </button>
                </div>
              )}
            </div>
          </div>

          <main>
        <section className={view === "front" ? "active" : ""} id="front">
          <div className="hero">
            <div>
              <h2>Pick a theme, keep momentum.</h2>
              <p>The experience adapts across every page—front, lists, and individual items—so your flow and task outlines stay consistent.</p>
              <div className="cta-buttons">
                <button className="button" onClick={() => changeView("lists")}>Open my lists</button>
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
        </section>

        <section className={view === "lists" ? "active" : ""} id="lists">
          <div className="split">
            <div className="panel">
              <h3>Create a list</h3>
              <form onSubmit={createList}>
                <input name="listName" type="text" placeholder="List name" required />
                <button type="submit" className="button">Add list</button>
              </form>
            </div>
            <div className="panel">
              <h3>Manage lists</h3>
              <p>Create, rename, or delete lists. Open a list to work on its tasks.</p>
            </div>
          </div>
          <div className="list">
            {lists.length === 0 && <div className="status">No lists yet. Create one to get started.</div>}
            {lists.map((list) => (
              <CollapsibleList
                key={list.id}
                list={list}
                isSelected={selectedListId === list.id}
                onOpen={() => selectList(list.id)}
                onRename={() => setListPrompt({ mode: "rename", list })}
                onDelete={() => setListPrompt({ mode: "delete", list })}
                onSummarise={() => summariseList(list.id)}
                summary={listSummaries[list.id]}
              />
            ))}
          </div>
        </section>

        <section className={view === "detail" ? "active" : ""} id="detail">
          {!selectedListId && <div className="status">Select or create a list first.</div>}
          {selectedListId && (
            <>
              <div className="split">
                <div className="panel create-panel">
                  <button
                    className="collapse-header"
                    onClick={() => setCreateOpen((o) => !o)}
                    type="button"
                  >
                    <span>Create a task</span>
                    <span className="collapse-icon">{createOpen ? "−" : "+"}</span>
                  </button>
                  {createOpen && (
                    <>
                      <p className="muted">Working in: {currentList?.name || "List"}</p>
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
                        <DeadlineSelect
                          dateOptions={dateOptions}
                          timeOptions={timeOptions}
                          value={createDeadline}
                          onChange={setCreateDeadline}
                          label="Deadline (optional)"
                        />
                        <button type="submit" className="button">Add task</button>
                      </form>
                    </>
                  )}
                </div>
              </div>
          <div className="detail-body">
            <aside className="tasks-sidebar">
              <h3>Tasks in this list</h3>
              <div className="list">
                {todos.length === 0 && <div className="status">No tasks yet in this list.</div>}
                {todos.map((todo) => (
                <CollapsibleTask
                  key={todo.id}
                  todo={todo}
                  relatedLabel={todo.related_id ? `Related: ${getTaskNameById(todo.related_id) || "Unknown"}` : ""}
                  onOpen={() => selectTodo(todo.id)}
                  onDelete={() => setDeletePrompt(todo)}
                  formatDeadline={formatDeadline}
                  onToggleComplete={toggleComplete}
                />
              ))}
            </div>
          </aside>
            <div>
              <h3>Selected todo</h3>
              <p className="muted">Current list: {currentList?.name || "None"}</p>
              {!selectedTodo && <div className="status">Pick a task from "My Lists" to view details.</div>}
              {selectedTodo && (
                <div className="panel-grid">
                  <div className="panel">
                    <h3>{selectedTodo.text}</h3>
                    {selectedTodo.related_id ? <p>{`Related to ${getTaskNameById(selectedTodo.related_id) || "Unknown"}`}</p> : null}
                    {selectedTodo.deadline ? <p className="muted">{formatDeadline(selectedTodo.deadline)}</p> : null}
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
                 <DeadlinePicker
                   title="Update deadline"
                   dateOptions={dateOptions}
                   timeOptions={timeOptions}
                   currentDeadline={selectedTodo.deadline}
                   onSave={saveDeadline}
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
                        {item.related_id ? <span>{`Related: ${getTaskNameById(item.related_id) || "Unknown"}`}</span> : null}
                      </div>
                      <div>{item.text}</div>
                      {item.deadline ? <p className="muted">{formatDeadline(item.deadline)}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </section>
      </main>
        </div>
      </div>

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

      <ListModal
        prompt={listPrompt}
        onCancel={() => setListPrompt(null)}
        onRename={async (id, name) => {
          await renameList(id, name);
          setListPrompt(null);
        }}
        onDelete={async (id) => {
          await removeList(id);
          setListPrompt(null);
        }}
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

function DeadlineSelect({ value, onChange, dateOptions, timeOptions, label }) {
  return (
    <div className="deadline-select">
      <label className="muted">{label}</label>
      <div className="deadline-row">
        <select value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })}>
          <option value="">Date</option>
          {dateOptions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })}>
          <option value="">Time</option>
          {timeOptions.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DeadlinePicker({ title, dateOptions, timeOptions, currentDeadline, onSave }) {
  const initial = splitDeadline(currentDeadline);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(splitDeadline(currentDeadline));
  }, [currentDeadline]);

  const composed = value.date && value.time ? `${value.date}T${value.time}:00` : "";

  return (
    <div className="panel">
      <h3>{title}</h3>
      <DeadlineSelect value={value} onChange={setValue} dateOptions={dateOptions} timeOptions={timeOptions} label="Deadline (optional)" />
      <button className="button" onClick={() => onSave(composed)}>Save changes</button>
    </div>
  );
}

function CollapsibleTask({ todo, relatedLabel, onOpen, onDelete, formatDeadline, onToggleComplete }) {
  const [open, setOpen] = useState(false);
  const hasRelated = !!todo.related_id;
  const deadlineText = formatDeadline(todo.deadline);
  const hasDeadline = !!todo.deadline && deadlineText !== "No deadline";
  return (
    <article className={`task-card ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="task-meta">
        <span className="badge">Task</span>
        {hasRelated && <span>{relatedLabel}</span>}
      </div>
      <div className="task-row">
        <label className="task-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!todo.completed}
            onChange={(e) => onToggleComplete(todo.id, e.target.checked)}
          />
          <span className={`task-title ${todo.completed ? "task-done" : ""}`}>{todo.text}</span>
        </label>
        {hasDeadline && <span className="muted">{deadlineText}</span>}
      </div>
      {open && (
        <div className="actions">
          <button className="button secondary" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open</button>
          <button className="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>
        </div>
      )}
    </article>
  );
}

function CollapsibleList({ list, isSelected, onOpen, onRename, onDelete, onSummarise, summary }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`task-card ${isSelected ? "active-card" : ""} ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="task-meta">
        <span className="badge">List</span>
        {isSelected ? <span>Selected</span> : null}
      </div>
      <div className="task-row">
        <div className="task-title">{list.name}</div>
      </div>
      {open && (
        <>
          <div className="actions">
            <button className="button secondary" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open</button>
            <button className="ghost" onClick={(e) => { e.stopPropagation(); onRename(); }}>Rename</button>
            <button className="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>
            <button className="button secondary" onClick={(e) => { e.stopPropagation(); onSummarise(); }}>AI summary</button>
          </div>
          {summary && <p className="muted multiline">{summary}</p>}
        </>
      )}
    </article>
  );
}

function SettingsPanel({ open, onClose, theme, setTheme }) {
  if (!open) return null;
  const [openSelect, setOpenSelect] = useState(false);

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
                    style={{ background: themePreviews[key]?.bg, borderColor: themePreviews[key]?.border }}
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

function ListModal({ prompt, onCancel, onRename, onDelete }) {
  const [value, setValue] = useState(prompt?.list?.name || "");

  useEffect(() => {
    setValue(prompt?.list?.name || "");
  }, [prompt]);

  if (!prompt) return null;
  const { mode, list } = prompt;
  const isRename = mode === "rename";

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onCancel} aria-hidden="true"></div>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="list-modal-title">
        <h3 id="list-modal-title">{isRename ? "Rename list" : "Delete list?"}</h3>
        {isRename ? (
          <>
            <p className="muted">Update the name for “{list.name}”.</p>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="List name" />
            <div className="modal-actions">
              <button className="button secondary" onClick={onCancel}>Cancel</button>
              <button className="button" onClick={() => onRename(list.id, value)}>Save</button>
            </div>
          </>
        ) : (
          <>
            <p>Are you sure you want to delete “{list.name}” and its tasks?</p>
            <div className="modal-actions">
              <button className="button secondary" onClick={onCancel}>No</button>
              <button className="button" onClick={() => onDelete(list.id)}>Yes, delete</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
