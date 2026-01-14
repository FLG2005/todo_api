import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeInfo as HelpIcon,
  User as UserIcon,
  FileUser as FileUserIcon,
  House as HomeIcon,
  List as ListIcon,
  Navigation as NavigationIcon,
  ShieldQuestionMark as QueryIcon,
  Settings as SettingsIcon,
  ChevronDown,
  Eye,
  EyeOff,
  Flame,
  Coins
} from "lucide-react";

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

const sortTodosByFlags = (items = []) =>
  [...items].sort((a, b) => {
    const flagsA = a.flags ?? 0;
    const flagsB = b.flags ?? 0;
    if (flagsA !== flagsB) return flagsB - flagsA;
    return a.id - b.id;
  });

const cleanAiText = (text) => (typeof text === "string" ? text.replace(/\*/g, "") : text || "");

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
  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [closeHelpTimeout, setCloseHelpTimeout] = useState(null);
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [queriesModalOpen, setQueriesModalOpen] = useState(false);
  const [queriesFaqOpen, setQueriesFaqOpen] = useState(false);
  const [queriesSupportOpen, setQueriesSupportOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    return () => {
      if (closeMenuTimeout) clearTimeout(closeMenuTimeout);
      if (closeSettingsTimeout) clearTimeout(closeSettingsTimeout);
      if (closeHelpTimeout) clearTimeout(closeHelpTimeout);
    };
  }, [closeMenuTimeout, closeSettingsTimeout, closeHelpTimeout]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("authUser");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.username) {
          setUser(parsed);
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to load stored user", err);
    }
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    const modalOpen =
      showSettings ||
      deletePrompt ||
      listPrompt ||
      navModalOpen ||
      getStartedOpen ||
      queriesModalOpen ||
      queriesFaqOpen ||
      queriesSupportOpen ||
      authModalOpen ||
      !user;

    if (!modalOpen) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    showSettings,
    deletePrompt,
    listPrompt,
    navModalOpen,
    getStartedOpen,
    queriesModalOpen,
    queriesFaqOpen,
    queriesSupportOpen,
    authModalOpen,
    user
  ]);

  useEffect(() => {
    const themeClass = themes[theme]?.className || themes.default.className;
    document.body.className = themeClass;
  }, [theme]);

  useEffect(() => {
    if (user?.id) {
      loadLists();
    } else {
      setLists([]);
      setSelectedListId(null);
    }
  }, [user?.id]);

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
    if (!user?.id) return;
    try {
      const params = new URLSearchParams({ user_id: user.id });
      const data = await api.json(api.url(`/lists?${params.toString()}`));
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
    if (!user?.id) {
      setTodos([]);
      return;
    }
    try {
      const params = new URLSearchParams({ list_id: selectedListId, user_id: user.id });
      const data = await api.json(api.url(`/todo_list?${params.toString()}`));
      setTodos(sortTodosByFlags(data));
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
    if (!user?.id) {
      alert("You must be logged in to create a list.");
      return;
    }
    try {
      const params = new URLSearchParams({ name, user_id: user.id });
      await api.json(api.url(`/lists?${params.toString()}`), { method: "POST" });
      form.reset();
      await loadLists();
    } catch (err) {
      alert(`Could not create list: ${err.message}`);
    }
  }

  async function renameList(id, name) {
    if (!name.trim()) return;
    if (!user?.id) {
      alert("You must be logged in to rename lists.");
      return;
    }
    try {
      const params = new URLSearchParams({ name: name.trim(), user_id: user.id });
      await api.json(api.url(`/lists/${id}?${params.toString()}`), { method: "PUT" });
      await loadLists();
      if (selectedListId === id) {
        setSelectedListId(id);
      }
    } catch (err) {
      alert(`Failed to rename list: ${err.message}`);
    }
  }

  async function removeList(id) {
    if (!user?.id) {
      alert("You must be logged in to delete lists.");
      return;
    }
    try {
      const params = new URLSearchParams({ user_id: user.id });
      await api.json(api.url(`/lists/${id}?${params.toString()}`), { method: "DELETE" });
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
    if (!user?.id) {
      alert("You must be logged in to add tasks.");
      return;
    }
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
    const params = new URLSearchParams({ todo_text: text, list_id: selectedListId, user_id: user.id });
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
      const params = new URLSearchParams({ user_id: user.id });
      await api.json(api.url(`/delete_a_todo/${id}?${params.toString()}`), { method: "DELETE" });
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
      const params = new URLSearchParams({ id, completed, user_id: user.id });
      await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      if (selectedTodo?.id === id) {
        await selectTodo(id);
      }
    } catch (err) {
      console.error("Unable to update task", err);
    }
  }

  async function updateFlags(id, flags) {
    try {
      const params = new URLSearchParams({ id, flags, user_id: user.id });
      await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      await loadTodos();
      if (selectedTodo?.id === id) {
        await selectTodo(id);
      }
    } catch (err) {
      alert(`Unable to update flags: ${err.message}`);
    }
  }

  async function selectTodo(id) {
    try {
      const params = new URLSearchParams({ user_id: user.id });
      const todo = await api.json(api.url(`/fetch_a_todo/${id}?${params.toString()}`));
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
    const params = new URLSearchParams({ id: selectedTodo.id, text, user_id: user.id });
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
    const params = new URLSearchParams({ id: selectedTodo.id, user_id: user.id });
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
    const params = new URLSearchParams({ id: selectedTodo.id, user_id: user.id });
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
      const params = new URLSearchParams({ user_id: user.id });
      const data = await api.json(api.url(`/fetch_related_todos/${selectedTodo.id}?${params.toString()}`));
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
      const params = new URLSearchParams({ user_id: user.id });
      const recs = await api.json(api.url(`/reccomended_todos/${selectedTodo.id}?${params.toString()}`), { method: "POST" });
      const lines = recs.todos?.map((t) => `• ${t.text}`).join("\n") || "No recommendations returned.";
      setRecommendations(lines);
    } catch (err) {
      setRecommendations(`Failed to get recommendations: ${err.message}`);
    }
  }

  async function summariseTodos() {
    setSummary("Summarising...");
    try {
      const params = new URLSearchParams({ user_id: user.id });
      const text = await api.text(api.url(`/summarise_todos?${params.toString()}`), { method: "POST" });
      setSummary(cleanAiText(text));
    } catch (err) {
      setSummary(`Unable to summarise: ${err.message}`);
    }
  }

  async function summariseList(listId) {
    setListSummaries((prev) => ({ ...prev, [listId]: "Summarising..." }));
    try {
      const params = new URLSearchParams({ list_id: listId, user_id: user.id });
      const text = await api.text(api.url(`/summarise_todos?${params.toString()}`), { method: "POST" });
      const cleaned = cleanAiText(text);
      setListSummaries((prev) => ({ ...prev, [listId]: cleaned }));
      if (listId === selectedListId) {
        setSummary(cleaned);
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

  const handleAuth = async (mode, username, password) => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const data = await api.json(api.url(`/auth/${mode}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const withSecret = { ...data, password };
      setUser(withSecret);
      localStorage.setItem("authUser", JSON.stringify(withSecret));
      setAuthModalOpen(false);
    } catch (err) {
      let friendly = "Unable to authenticate";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          friendly = parsed?.detail || friendly;
        } catch {
          friendly = err.message;
        }
      }
      setAuthError(friendly);
    } finally {
      setAuthLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="app">
        <AuthModal
          open
          mode={authMode}
          onModeChange={(next) => {
            setAuthMode(next);
            setAuthError("");
          }}
          onSubmit={(username, password) => handleAuth(authMode, username, password)}
          loading={authLoading}
          error={authError}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div
        className="help-launcher-stack"
        onMouseEnter={() => {
          if (closeHelpTimeout) clearTimeout(closeHelpTimeout);
          setHelpOpen(true);
        }}
        onMouseLeave={() => {
          const timeout = setTimeout(() => setHelpOpen(false), 120);
          setCloseHelpTimeout(timeout);
        }}
      >
        <button
          className="settings-launcher"
          onClick={() => setHelpOpen((o) => !o)}
          aria-label="Open help"
          title="Help"
        >
          <HelpIcon className="gear-icon" aria-hidden="true" />
        </button>
        {helpOpen && (
          <div className="help-dropdown">
            <div className="dropdown-section">
              <div className="dropdown-label">Need a hand?</div>
            </div>
            <button
              className="nav-button full"
              onClick={() => {
                setHelpOpen(false);
                setNavModalOpen(true);
              }}
            >
              Navigation <NavigationIcon className="menu-icon" aria-hidden="true" />
            </button>
            <button
              className="nav-button full"
              onClick={() => {
                setHelpOpen(false);
                setQueriesModalOpen(true);
              }}
            >
              Queries <QueryIcon className="menu-icon" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="coins-card" aria-label="Check coins">
          <Coins className="coins-icon" aria-hidden="true" />
          <div className="coins-meta">
            <span className="coins-label">Check coins</span>
            <span className="coins-value">0</span>
          </div>
        </div>
      </div>
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
                    Home <HomeIcon className="menu-icon" aria-hidden="true" />
                  </button>
                  <button
                    className={`nav-button full ${view === "lists" ? "active" : ""}`}
                    onClick={() => {
                      changeView("lists");
                      setMenuOpen(true);
                    }}
                  >
                    My Lists <ListIcon className="menu-icon" aria-hidden="true" />
                  </button>
                  <button
                    className={`nav-button full ${view === "detail" ? "active" : ""}`}
                    onClick={() => {
                      changeView("detail");
                      setMenuOpen(true);
                    }}
                  >
                    Current list <FileUserIcon className="menu-icon" aria-hidden="true" />
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
                <SettingsIcon className="gear-icon" aria-hidden="true" />
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
                    Open settings <SettingsIcon className="menu-icon" aria-hidden="true" />
                  </button>
                  <button
                    className="nav-button full"
                    onClick={() => {
                      setSettingsHoverOpen(false);
                      setShowSettings(true);
                      setTimeout(() => {
                        const profileOpenButton = document.getElementById("profile-open-btn");
                        if (profileOpenButton) {
                          profileOpenButton.focus();
                        }
                      }, 0);
                    }}
                  >
                    Profile <UserIcon className="menu-icon" aria-hidden="true" />
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
              <div className="panel create-list-panel" style={{ marginTop: "16px" }}>
                <h3>Create a list</h3>
                <form onSubmit={createList}>
                  <input name="listName" type="text" placeholder="List name" required />
                  <button type="submit" className="button">Add list</button>
                </form>
              </div>
            </section>

            <section className={view === "detail" ? "active" : ""} id="detail">
              {!selectedListId && <div className="status">Select or create a list first.</div>}
              {selectedListId && (
                <>
                  <div className="create-stack">
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
                    <div className="panel tasks-panel">
                      <button
                        className="collapse-header"
                        type="button"
                        onClick={() => setTasksCollapsed((o) => !o)}
                      >
                        <span>Tasks in this list</span>
                        <span className="collapse-icon">{tasksCollapsed ? "+" : "−"}</span>
                      </button>
                      {!tasksCollapsed && (
                        <div className="list tasks-list-content">
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
                              onFlagChange={updateFlags}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="detail-body">
                    <div>
                      <h3>Selected todo</h3>
                      <p className="muted">Current list: {currentList?.name || "None"}</p>
                      {!selectedTodo && <div className="status">Pick a task from "My Lists" to view details.</div>}
                      {selectedTodo && (
                        <div className="panel-grid">
                          <div className="panel">
                            <h3>{selectedTodo.text}</h3>
                            {selectedTodo.related_id ? <p>{`Related to ${getTaskNameById(selectedTodo.related_id) || "Unknown"}`}</p> : null}
                            <div className="selected-flags-row">
                              <FlagStack count={selectedTodo.flags || 0} />
                              {selectedTodo.deadline ? <p className="muted">{formatDeadline(selectedTodo.deadline)}</p> : null}
                            </div>
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
        user={user}
        setUser={setUser}
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
      <NavigationModal
        open={navModalOpen}
        onClose={() => setNavModalOpen(false)}
        onGetStarted={() => {
          setNavModalOpen(false);
          setGetStartedOpen(true);
        }}
      />
      <GetStartedModal open={getStartedOpen} onClose={() => setGetStartedOpen(false)} />
      <QueriesModal
        open={queriesModalOpen}
        onClose={() => setQueriesModalOpen(false)}
        onOpenFaq={() => {
          setQueriesModalOpen(false);
          setQueriesFaqOpen(true);
        }}
        onOpenSupport={() => {
          setQueriesModalOpen(false);
          setQueriesSupportOpen(true);
        }}
      />
      <QueriesFaqModal open={queriesFaqOpen} onClose={() => setQueriesFaqOpen(false)} />
      <QueriesSupportModal open={queriesSupportOpen} onClose={() => setQueriesSupportOpen(false)} />
      <AuthModal
        open={authModalOpen || !user}
        mode={authMode}
        onModeChange={(next) => {
          setAuthMode(next);
          setAuthError("");
        }}
        onSubmit={(username, password) => handleAuth(authMode, username, password)}
        loading={authLoading}
        error={authError}
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

function CollapsibleTask({ todo, relatedLabel, onOpen, onDelete, formatDeadline, onToggleComplete, onFlagChange }) {
  const [open, setOpen] = useState(false);
  const hasRelated = !!todo.related_id;
  const deadlineText = formatDeadline(todo.deadline);
  const hasDeadline = !!todo.deadline && deadlineText !== "No deadline";
  const flags = todo.flags || 0;
  return (
    <article className={`task-card ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="task-top">
        <div className="task-meta">
          <span className="badge">Task</span>
          {hasRelated && <span>{relatedLabel}</span>}
        </div>
        {flags > 0 ? <FlagStack count={flags} /> : null}
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
          <FlagControl
            value={flags}
            onChange={(next) => onFlagChange(todo.id, next)}
          />
          <button className="button secondary" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open</button>
          <button className="ghost" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>
        </div>
      )}
    </article>
  );
}

function CollapsibleList({ list, isSelected, onOpen, onRename, onDelete, onSummarise, summary }) {
  const [open, setOpen] = useState(false);
  const taskCount = typeof list.task_count === "number" ? list.task_count : 0;
  const taskLabel = `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;
  return (
    <article
      className={`task-card list-card ${isSelected ? "active-card" : ""} ${open ? "open" : ""}`}
      onClick={() => setOpen(!open)}
    >
      <div className="list-count-banner">{taskLabel}</div>
      <div className="task-meta">
        <span className="badge">List</span>
        {isSelected ? <span className="badge selected-badge">Selected</span> : null}
      </div>
      <div className="task-row">
        <div className="task-title">{list.name}</div>
        <ChevronDown className={`list-chevron ${open ? "open" : ""}`} size={16} />
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

function SettingsPanel({ open, onClose, theme, setTheme, user, setUser }) {
  if (!open) return null;
  const [openSelect, setOpenSelect] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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
        <div className="panel" style={{ marginBottom: "16px" }}>
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Profile</div>
              <div className="muted">View your account details.</div>
            </div>
            <button id="profile-open-btn" className="button secondary" onClick={() => setProfileOpen(true)}>Open</button>
          </div>
        </div>
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
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} user={user} setUser={setUser} />
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

function DeleteModal({ todo, onConfirm, onCancel }) {
  if (!todo) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onCancel} aria-hidden="true"></div>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <button
          onClick={onCancel}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="delete-title">Delete task?</h3>
        <p>Are you sure you want to delete “{todo.text}”?</p>
        <div className="modal-actions">
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
        <button
          onClick={onCancel}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="list-modal-title">{isRename ? "Rename list" : "Delete list?"}</h3>
        {isRename ? (
          <>
            <p className="muted">Update the name for “{list.name}”.</p>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="List name" />
            <div className="modal-actions">
              <button className="button" onClick={() => onRename(list.id, value)}>Save</button>
            </div>
          </>
        ) : (
          <>
            <p>Are you sure you want to delete “{list.name}” and its tasks?</p>
            <div className="modal-actions">
              <button className="button" onClick={() => onDelete(list.id)}>Yes, delete</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NavigationModal({ open, onClose, onGetStarted }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content nav-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nav-modal-title"
        aria-describedby="nav-modal-desc"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1,
            zIndex: 10
          }}
        >
          ✕
        </button>
        <div className="nav-modal-header">
          <h3 id="nav-modal-title">Navigation Menu</h3>
          <p id="nav-modal-desc" className="muted nav-modal-desc">Never take a wrong turn again!</p>
        </div>
        <div className="modal-actions">
          <button className="button" onClick={onGetStarted}>Get Started</button>
        </div>
      </div>
    </div>
  );
}

function GetStartedModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content nav-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="get-started-title"
        aria-describedby="get-started-desc"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1,
            zIndex: 10
          }}
        >
          ✕
        </button>
        <div className="nav-modal-header">
          <h3 id="get-started-title">Get to know your way around!</h3>
          <p id="get-started-desc" className="muted nav-modal-desc">Quick pointers will show you where to go next.</p>
        </div>
        <div className="nav-illustration" aria-hidden="true">
          <MenuDropdownIllustration />
        </div>
        <div className="nav-dialog" role="presentation">
          <p className="nav-dialog-copy">
            Use the menu tab to navigate the app. The Home screen reflects your profile, the My Lists page keeps all your
            lists stored safely, and the Current List tab lets you add, edit, or delete tasks from the list you’ve selected!
          </p>
        </div>
        <div className="modal-actions" style={{ justifyContent: "center" }}>
          {/* Actions removed as per instruction to use X button primarily, though "Okay got it" was an acknowledgment. */}
        </div>
      </div>
    </div>
  );
}

function FlagIcon({ filled }) {
  return (
    <svg className={`flag-icon ${filled ? "filled" : ""}`} viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path
        d="M6 4v16m0-13.5c1.2-.5 2.8-1.2 4-1.2 2 0 3.3 1.4 4.8 1.4 1 0 2.2-.4 3.2-.9v8c-1 .5-2.2.9-3.2.9-1.5 0-2.8-1.4-4.8-1.4-1.2 0-2.8.7-4 1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlagStack({ count, max = 3, showEmpty = false }) {
  const total = showEmpty ? max : count;
  if (total <= 0) {
    return <div className="flag-stack" aria-label="0 flags" />;
  }
  return (
    <div className="flag-stack" aria-label={`${count} flag${count === 1 ? "" : "s"}`}>
      {Array.from({ length: total }).map((_, idx) => (
        <FlagIcon key={idx} filled={idx < count} />
      ))}
    </div>
  );
}

function FlagControl({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const safeValue = Number.isFinite(value) ? value : 0;
  const options = [0, 1, 2, 3];

  useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      className="flag-control"
      ref={ref}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="flag-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <FlagStack count={safeValue} showEmpty />
      </button>
      {open && (
        <div className="flag-menu" role="listbox">
          {options.map((count) => (
            <button
              key={count}
              className={`flag-option ${count === safeValue ? "active" : ""}`}
              role="option"
              aria-selected={count === safeValue}
              onClick={() => {
                onChange(count);
                setOpen(false);
              }}
            >
              <FlagStack count={count} showEmpty />
              <span className="flag-label">{count === 1 ? "1 flag" : `${count} flags`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuDropdownIllustration() {
  return (
    <svg
      className="nav-illustration-svg"
      viewBox="0 0 320 340"
      role="img"
      aria-label="Static preview of the menu dropdown"
    >
      <defs>
        <linearGradient id="menuBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e5d5c1" />
          <stop offset="100%" stopColor="#c6b19a" />
        </linearGradient>
        <filter id="menuShadow" x="-12%" y="-12%" width="124%" height="124%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="rgba(0,0,0,0.22)" />
        </filter>
        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="rgba(0,0,0,0.14)" />
        </filter>
      </defs>
      <rect x="0" y="0" width="320" height="340" fill="url(#menuBg)" rx="22" />
      <g transform="translate(72, 22)" filter="url(#menuShadow)">
        <rect x="92" y="0" width="102" height="56" rx="18" fill="#f6e9dd" stroke="#b47b46" strokeWidth="2.5" />
        <text x="143" y="32" textAnchor="middle" fontSize="18" fontWeight="800" fill="#4d3824">Menu</text>
      </g>
      <g transform="translate(44, 94)" filter="url(#cardShadow)">
        <rect x="0" y="0" width="232" height="232" rx="24" fill="#fdfaf6" stroke="#e2cbb3" strokeWidth="2.5" />
        <rect x="14" y="16" width="204" height="56" rx="14" fill="#e8ccaa" stroke="#b47b46" strokeWidth="2.5" />
        <rect x="14" y="86" width="204" height="56" rx="14" fill="#f9f1e8" stroke="#e2cbb3" strokeWidth="2.5" />
        <rect x="14" y="156" width="204" height="56" rx="14" fill="#f9f1e8" stroke="#e2cbb3" strokeWidth="2.5" />
        <text x="116" y="52" textAnchor="middle" fontSize="19" fontWeight="800" fill="#2d1f15">Home</text>
        <path
          d="M194 32 L204 40 L204 56 H186 V40 Z"
          fill="none"
          stroke="#2d1f15"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="116" y="122" textAnchor="middle" fontSize="19" fontWeight="800" fill="#2d1f15">My Lists</text>
        <path
          d="M188 108 h18 M188 116 h18 M188 124 h18"
          stroke="#2d1f15"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="116" y="192" textAnchor="middle" fontSize="19" fontWeight="800" fill="#2d1f15">Current list</text>
        <rect x="186" y="176" width="20" height="20" rx="6" fill="none" stroke="#2d1f15" strokeWidth="2.5" />
        <path d="M192 184 h8" stroke="#2d1f15" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M192 190 h12" stroke="#2d1f15" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function QueriesModal({ open, onClose, onOpenFaq, onOpenSupport }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="queries-modal-title"
        style={{ width: "min(800px, 92vw)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="queries-modal-title" style={{ textAlign: "center", marginBottom: "8px" }}>Hit a roadblock?</h3>
        <p style={{ textAlign: "center", marginBottom: "24px", marginTop: "0" }} className="muted">
          Questions, feedback, or support requests can be submitted here. We’re committed to helping you work smarter and more efficiently.
        </p>
        <div className="modal-actions" style={{ justifyContent: "stretch" }}>
          <button className="button" style={{ flex: 1, whiteSpace: "nowrap" }} onClick={onOpenFaq}>
            Commonly asked questions
          </button>
          <button className="button" style={{ flex: 1 }} onClick={onOpenSupport}>
            Contact support
          </button>
        </div>
      </div>
    </div>
  );
}

function QueriesFaqModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="queries-faq-modal-title"
        style={{ width: "min(820px, 94vw)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="queries-faq-modal-title" style={{ textAlign: "center", marginBottom: "8px" }}>
          Common questions, clear answers
        </h3>
        <p style={{ textAlign: "center", marginBottom: "20px", marginTop: "0" }} className="muted">
          Browse quick answers to the topics we hear most often so you can keep moving without waiting on support.
        </p>
        <div className="panel-grid" style={{ gap: "16px" }}>
          <div className="panel">
            <h4 style={{ marginTop: 0 }}>Getting started</h4>
            <ul className="muted" style={{ margin: "8px 0 0 0", paddingLeft: "16px", lineHeight: 1.6 }}>
              <li>How to create and organize new lists.</li>
              <li>Tips for keeping tasks prioritized.</li>
              <li>Saving your favorite templates.</li>
            </ul>
          </div>
          <div className="panel">
            <h4 style={{ marginTop: 0 }}>Working smarter</h4>
            <ul className="muted" style={{ margin: "8px 0 0 0", paddingLeft: "16px", lineHeight: 1.6 }}>
              <li>Generating recommendations for tricky tasks.</li>
              <li>Linking related todos for better context.</li>
              <li>Setting deadlines and reminders.</li>
            </ul>
          </div>
          <div className="panel">
            <h4 style={{ marginTop: 0 }}>Account & support</h4>
            <ul className="muted" style={{ margin: "8px 0 0 0", paddingLeft: "16px", lineHeight: 1.6 }}>
              <li>Managing preferences and theme choices.</li>
              <li>What to include when submitting feedback.</li>
              <li>How to reach the team for deeper help.</li>
            </ul>
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: "20px", justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function QueriesSupportModal({ open, onClose }) {
  if (!open) return null;
  const [supportMessage, setSupportMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = encodeURIComponent(supportMessage || "No details provided.");
    const subject = encodeURIComponent("Support request");
    window.location.href = `mailto:fabiangaertner0112@icloud.com?subject=${subject}&body=${body}`;
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="queries-support-modal-title"
        style={{ width: "min(820px, 94vw)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="queries-support-modal-title" style={{ textAlign: "center", marginBottom: "8px" }}>
          We&apos;re here to help!
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="panel" style={{ marginTop: "16px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "8px" }}>
              Have a problem? Let us know!
            </label>
            <input
              type="text"
              placeholder="Share what’s happening"
              style={{ width: "100%" }}
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
            />
          </div>
          <div className="modal-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
            <button className="button" type="submit" disabled title="Sending temporarily disabled">
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const parseApiError = (err, fallback) => {
  if (err?.message) {
    try {
      const parsed = JSON.parse(err.message);
      return parsed?.detail || fallback;
    } catch {
      return err.message;
    }
  }
  return fallback;
};

function ProfileModal({ open, onClose, user, setUser }) {
  const [showPassword, setShowPassword] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const storedPassword = user?.password || "";
  const hasPassword = Boolean(storedPassword);
  const maskedPassword = hasPassword ? "•".repeat(Math.max(storedPassword.length, 8)) : "";
  const displayPassword = hasPassword
    ? showPassword
      ? storedPassword
      : maskedPassword
    : "Password not stored. Log out and sign in again to view.";
  const loginStreak = Number.isFinite(user?.login_streak) ? user.login_streak : 0;

  const handleCloseAll = () => {
    setUsernameModalOpen(false);
    setPasswordModalOpen(false);
    onClose();
  };

  if (!open) return null;
  if (!user) {
    return (
      <div className="modal">
        <div className="modal-backdrop" onClick={handleCloseAll} aria-hidden="true"></div>
        <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" style={{ width: "min(520px, 94vw)" }}>
          <button
            onClick={handleCloseAll}
            aria-label="Close"
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "var(--muted)",
              padding: "8px",
              lineHeight: 1
            }}
          >
            ✕
          </button>
          <h3 id="profile-modal-title" style={{ textAlign: "center", marginBottom: "12px" }}>
            My Profile
          </h3>
          <div className="status error">No user loaded. Please log in again.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="modal">
        <div className="modal-backdrop" onClick={handleCloseAll} aria-hidden="true"></div>
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          style={{ width: "min(520px, 94vw)" }}
        >
          <button
            onClick={handleCloseAll}
            aria-label="Close"
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "var(--muted)",
              padding: "8px",
              lineHeight: 1
            }}
          >
            ✕
          </button>
          <h3 id="profile-modal-title" style={{ textAlign: "center", marginBottom: "12px" }}>
            My Profile
          </h3>
          <div className="panel streak-card" style={{ marginTop: "8px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Login streak</label>
            <div style={{ fontWeight: 700, fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{loginStreak} day{loginStreak === 1 ? "" : "s"}</span>
              <Flame size={18} color="var(--accent)" />
            </div>
          </div>
          <div className="panel" style={{ marginTop: "8px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Username</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="text" value={user?.username || ""} readOnly style={{ flex: 1 }} />
              <button className="button" type="button" onClick={() => setUsernameModalOpen(true)}>Change username</button>
            </div>
          </div>
          <div className="panel" style={{ marginTop: "12px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Password</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type={hasPassword ? (showPassword ? "text" : "password") : "text"}
                value={displayPassword}
                readOnly
                style={{ flex: 1 }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                className="button secondary"
                onClick={() => hasPassword && setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                disabled={!hasPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
                <button className="button" type="button" onClick={() => setPasswordModalOpen(true)}>Change password</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <UpdateUsernameModal
        open={usernameModalOpen}
        onClose={() => setUsernameModalOpen(false)}
        user={user}
        setUser={setUser}
      />
      <UpdatePasswordModal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        user={user}
        setUser={setUser}
        onHidePassword={() => setShowPassword(false)}
      />
    </>
  );
}

function UpdateUsernameModal({ open, onClose, user, setUser }) {
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setNewUsername(user?.username || "");
    setCurrentPassword("");
    setStatus("");
    setError("");
    setUpdating(false);
  }, [user, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      setError("No user loaded");
      return;
    }
    setStatus("");
    setError("");
    setUpdating(true);
    try {
      const data = await api.json(api.url("/auth/update_username"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          new_username: newUsername,
          current_password: currentPassword
        })
      });
      const updated = { ...user, username: data.username };
      if (setUser) setUser(updated);
      localStorage.setItem("authUser", JSON.stringify(updated));
      setStatus("Username updated.");
      setCurrentPassword("");
    } catch (err) {
      setError(parseApiError(err, "Unable to update username"));
    } finally {
      setUpdating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-username-title"
        style={{ width: "min(520px, 94vw)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="update-username-title" style={{ textAlign: "center", marginBottom: "12px" }}>
          Change username
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="panel" style={{ marginTop: "8px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px" }}>New username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              placeholder="New username"
            />
            <label className="muted" style={{ display: "block", margin: "10px 0 6px" }}>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Current password"
            />
          </div>
          {(status || error) && (
            <div className={`status ${error ? "error" : "success"}`} style={{ marginTop: "12px" }}>
              {error || status}
            </div>
          )}
          <div className="modal-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button" type="submit" disabled={updating}>
              {updating ? "Updating..." : "Save username"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdatePasswordModal({ open, onClose, user, setUser, onHidePassword }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setCurrentPassword("");
    setNewPassword("");
    setStatus("");
    setError("");
    setUpdating(false);
  }, [user, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      setError("No user loaded");
      return;
    }
    setStatus("");
    setError("");
    setUpdating(true);
    try {
      await api.json(api.url("/auth/update_password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      const updated = { ...user, password: newPassword };
      if (setUser) setUser(updated);
      localStorage.setItem("authUser", JSON.stringify(updated));
      setStatus("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      if (onHidePassword) onHidePassword();
    } catch (err) {
      setError(parseApiError(err, "Unable to update password"));
    } finally {
      setUpdating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-password-title"
        style={{ width: "min(520px, 94vw)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "8px",
            lineHeight: 1
          }}
        >
          ✕
        </button>
        <h3 id="update-password-title" style={{ textAlign: "center", marginBottom: "12px" }}>
          Change password
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="panel" style={{ marginTop: "8px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Current password"
            />
            <label className="muted" style={{ display: "block", margin: "10px 0 6px" }}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="New password"
            />
          </div>
          {(status || error) && (
            <div className={`status ${error ? "error" : "success"}`} style={{ marginTop: "12px" }}>
              {error || status}
            </div>
          )}
          <div className="modal-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button" type="submit" disabled={updating}>
              {updating ? "Updating..." : "Save password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function AuthModal({ open, mode, onModeChange, onSubmit, loading, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setUsername("");
    setPassword("");
  }, [mode, open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(username, password);
  };

  return (
    <div className="modal">
      <div className="modal-backdrop" aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        style={{ width: "min(460px, 94vw)" }}
      >
        <h3 id="auth-modal-title" style={{ textAlign: "center", marginBottom: "12px" }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h3>
        <p className="muted" style={{ textAlign: "center", marginTop: 0, marginBottom: "16px" }}>
          {mode === "login" ? "Log in to access your todos." : "Sign up to save your todos."}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="panel" style={{ marginTop: "8px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "8px" }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
            />
          </div>
          <div className="panel" style={{ marginTop: "12px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "8px" }}>Password</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error ? (
            <div className="status error" style={{ marginTop: "12px" }}>
              {error}
            </div>
          ) : null}
          <div className="modal-actions" style={{ marginTop: "16px", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => onModeChange(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Create account" : "Have an account? Log in"}
            </button>
            <button className="button" type="submit" disabled={loading}>
              {loading ? "Working..." : mode === "login" ? "Log in" : "Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
