import { useEffect, useMemo, useRef, useState, Component } from "react";
import {
  BadgeInfo as HelpIcon,
  User as UserIcon,
  FileUser as FileUserIcon,
  House as HomeIcon,
  List as ListIcon,
  Navigation as NavigationIcon,
  ShieldQuestionMark as QueryIcon,
  Settings as SettingsIcon,
  Lock,
  ChevronDown,
  Eye,
  EyeOff,
  Flame,
  Coins,
  ShoppingCart,
  Crown,
  Sparkles
} from "lucide-react";
import { PiSoccerBall } from "react-icons/pi";

const themes = {
  default: { className: "theme-default", label: "Default" },
  cozy: { className: "theme-cozy", label: "Cozy" },
  minimal: { className: "theme-minimal", label: "Minimalist" },
  space: { className: "theme-space", label: "Space" },
  royalGarden: { className: "theme-royal-garden", label: "Royal Garden" },
  beachDay: { className: "theme-beach-day", label: "Beach Day" },
  football: { className: "theme-football", label: "Football" }
};

const themePreviews = {
  default: { bg: "#f5f8ff", border: "#1f4bff" },
  cozy: { bg: "#fff3e3", border: "#c47c4a" },
  minimal: { bg: "#f7f7f8", border: "#1f2937" },
  space: { bg: "#0f1429", border: "#6ac7ff" },
  royalGarden: { bg: "#0f2017", border: "#d4af37" },
  beachDay: { bg: "#cfe8ff", border: "#f5d8a5" },
  football: { bg: "#33860e", border: "#0f2d16" }
};

const levelLockedThemes = [{ key: "football", level: 10 }];
const themeLevelRequirement = levelLockedThemes.reduce((map, entry) => {
  map[entry.key] = entry.level;
  return map;
}, {});
const getLevelUnlockedThemes = (level = 1) => levelLockedThemes.filter((entry) => level >= entry.level).map((entry) => entry.key);
const filterThemesByLevel = (themeKeys = [], level = 1) =>
  themeKeys.filter((key) => {
    const requirement = themeLevelRequirement[key];
    return !requirement || level >= requirement;
  });

const themeStoreItems = [
  {
    key: "royalGarden",
    label: "Royal Garden",
    description: "Verdant palette with gold accents for focus-friendly lists.",
    price: 150
  },
  {
    key: "beachDay",
    label: "Beach Day",
    description: "Sunny gradient, airy panels, and relaxed coastal vibes.",
    price: 150
  },
  {
    key: "football",
    label: "Football",
    description: "Light pitch greens, crisp white lines, and goal-bright splashes.",
    price: 0,
    unlockLevel: 10,
    purchasable: false
  }
];

const titleStoreItems = [
  {
    key: "rookie",
    label: "Rookie",
    description: "Break into the squad with your first rank-up.",
    unlockLevel: 2,
    purchasable: false,
    price: 0
  },
  {
    key: "baller",
    label: "Baller",
    description: "Prove your skills with a level 5 milestone.",
    unlockLevel: 5,
    purchasable: false,
    price: 0
  },
  {
    key: "junior",
    label: "Junior",
    description: "A fresh title for consistent check-ins.",
    price: 20
  },
  {
    key: "workaholic",
    label: "Workaholic",
    description: "For the always-on doers.",
    price: 50
  },
  {
    key: "brainiac",
    label: "Brainiac",
    description: "Smart planning meets sharp execution.",
    price: 100
  },
  {
    key: "holy-temple",
    label: "Holy Temple",
    description: "A legendary badge for the truly devoted.",
    price: 500
  },
  {
    key: "collector",
    label: "Collector",
    description: "Unlock every item.",
    price: 0,
    purchasable: false,
    unlockInventory: 9
  }
];

const titleLabelByKey = titleStoreItems.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

const baseUnlockedThemes = Object.keys(themes).filter((key) => !themeStoreItems.some((item) => item.key === key));

const views = ["front", "lists", "detail"];
const viewLabels = {
  front: "Home",
  lists: "My Lists",
  detail: "Individual List"
};
const normalizeView = (value) => (views.includes(value) ? value : "front");

const API_BASE = process.env.API_BASE || "http://localhost:8000";

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

const parseInventory = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);
const parseTitles = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Unexpected render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <div className="status error" style={{ margin: "20px auto", maxWidth: 520, textAlign: "center" }}>
            <p style={{ fontWeight: 700 }}>Something went wrong while rendering.</p>
            <p className="muted">{this.state.error?.message || "Unknown error"}</p>
            <button className="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
  const [goalExplosions, setGoalExplosions] = useState([]);
  const ballRef = useRef(null);
  const ballRafRef = useRef(null);
  const ballStateRef = useRef({ x: 0, y: 0, vx: 4, vy: 2 });
  const ballBoundsRef = useRef({ minX: 0, maxX: 0, minY: 0, maxY: 0, size: 36 });
  const ballLastTimeRef = useRef(0);
  const goalExplosionIdRef = useRef(0);
  const goalLineContactRef = useRef({ left: false, right: false });
  const userRef = useRef(null);
  const uiState = useMemo(
    () => ({
      view,
      selectedListId,
      menuOpen,
      showSettings,
      createOpen,
      settingsThemeOpen
    }),
    [view, selectedListId, menuOpen, showSettings, createOpen, settingsThemeOpen]
  );

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [closeHelpTimeout, setCloseHelpTimeout] = useState(null);
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [queriesModalOpen, setQueriesModalOpen] = useState(false);
  const [queriesFaqOpen, setQueriesFaqOpen] = useState(false);
  const [queriesSupportOpen, setQueriesSupportOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [purchasePrompt, setPurchasePrompt] = useState(null);
  const [titlePurchasePrompt, setTitlePurchasePrompt] = useState(null);
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [checkCoins, setCheckCoins] = useState(0);
  const [coinsInfoOpen, setCoinsInfoOpen] = useState(false);
  const [checkStoreOpen, setCheckStoreOpen] = useState(false);
  const [closeCoinsTimeout, setCloseCoinsTimeout] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [lockedPromptOpen, setLockedPromptOpen] = useState(false);
  const [user, setUser] = useState(null);
  const refreshedUserRef = useRef(false);
  const [notice, setNotice] = useState(null);
  const noticeTimeoutRef = useRef(null);
  const [unlockedThemes, setUnlockedThemes] = useState(baseUnlockedThemes);
  
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const loginStreak = Number.isFinite(user?.login_streak) ? user.login_streak : 0;
  const loginBest = Number.isFinite(user?.login_best)
    ? user.login_best
    : Number.isFinite(user?.login_streak)
      ? user.login_streak
      : 1;
  const tasksCheckedOff = Number.isFinite(user?.tasks_checked_off) ? user.tasks_checked_off : 0;
  const tasksCheckedOffToday = Number.isFinite(user?.tasks_checked_off_today) ? user.tasks_checked_off_today : 0;
  const xpProgress = Number.isFinite(user?.xp) ? Math.min(Math.max(user.xp, 0), 100) : 0;
  const userLevel = Number.isFinite(user?.level) ? Math.max(user.level, 1) : 1;
  const userRank = user?.rank || "Task Trainee";
  const itemsCollected = Array.isArray(user?.inventory) ? user.inventory.length : 0;
  const totalCollectibles = 10;
  const itemsCollectedLabel = `${Math.min(itemsCollected, totalCollectibles)} / ${totalCollectibles}`;
  const userTitles = parseTitles(user?.titles);

  useEffect(() => {
    return () => {
      if (closeMenuTimeout) clearTimeout(closeMenuTimeout);
      if (closeSettingsTimeout) clearTimeout(closeSettingsTimeout);
      if (closeHelpTimeout) clearTimeout(closeHelpTimeout);
      if (closeCoinsTimeout) clearTimeout(closeCoinsTimeout);
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, [closeMenuTimeout, closeSettingsTimeout, closeHelpTimeout, closeCoinsTimeout]);

  useEffect(() => {
    if (!user) return;
    setCheckCoins(user.check_coins || 0);
  }, [user]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("authUser");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.username) {
          const bestFromStore = Number.isFinite(parsed.login_best)
            ? parsed.login_best
            : Number.isFinite(parsed.login_streak)
              ? parsed.login_streak
              : 1;
          const tasksCheckedOff = Number.isFinite(parsed.tasks_checked_off) ? parsed.tasks_checked_off : 0;
          const tasksCheckedOffToday = Number.isFinite(parsed.tasks_checked_off_today)
            ? parsed.tasks_checked_off_today
            : 0;
          const xp = Number.isFinite(parsed.xp) ? parsed.xp : 0;
          const level = Number.isFinite(parsed.level) ? parsed.level : 1;
          const rank = parsed.rank || "Task Trainee";
          const inventory = parseInventory(parsed.inventory);
          const titles = parseTitles(parsed.titles);
          setUser({
            login_best: bestFromStore,
            tasks_checked_off: tasksCheckedOff,
            tasks_checked_off_today: tasksCheckedOffToday,
            xp,
            level,
            rank,
            inventory,
            titles,
            current_title: parsed.current_title || "",
            ...parsed
          });
          syncUnlockedFromInventory(inventory, parsed.id, level);
          return;
        }
    }
  } catch (err) {
      console.warn("Failed to load stored user", err);
    }
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    const refreshUser = async () => {
      if (!user?.username || !user?.password || refreshedUserRef.current) return;
      try {
        const data = await api.json(api.url(`/auth/login`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user.username, password: user.password })
        });
        const inventory = parseInventory(data.inventory);
        const titles = parseTitles(data.titles);
        const withSecret = {
          ...data,
          login_best: Number.isFinite(data.login_best) ? data.login_best : user.login_best ?? user.login_streak ?? 1,
          tasks_checked_off: Number.isFinite(data.tasks_checked_off) ? data.tasks_checked_off : user.tasks_checked_off ?? 0,
          tasks_checked_off_today: Number.isFinite(data.tasks_checked_off_today) ? data.tasks_checked_off_today : user.tasks_checked_off_today ?? 0,
          password: user.password,
          inventory,
          titles,
          current_title: data.current_title || user.current_title || "",
          xp: Number.isFinite(data.xp) ? data.xp : user.xp ?? 0,
          level: Number.isFinite(data.level) ? data.level : user.level ?? 1,
          rank: data.rank || user.rank || "Task Trainee"
        };
        setUser(withSecret);
        setCheckCoins(withSecret.check_coins || 0);
        localStorage.setItem("authUser", JSON.stringify(withSecret));
        syncUnlockedFromInventory(inventory, withSecret?.id, withSecret.level);
        refreshedUserRef.current = true;
      } catch (err) {
        console.warn("Could not refresh user session", err);
      }
    };
    refreshUser();
  }, [user]);

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
      checkStoreOpen ||
      purchasePrompt ||
      titlePurchasePrompt ||
      confirmLogoutOpen ||
      lockedPromptOpen ||
      coinsInfoOpen ||
      authModalOpen ||
      !user;
    const shouldLockScroll = modalOpen || view === "front";

    if (!shouldLockScroll) {
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
    checkStoreOpen,
    purchasePrompt,
    titlePurchasePrompt,
    confirmLogoutOpen,
    lockedPromptOpen,
    coinsInfoOpen,
    authModalOpen,
    user,
    view
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
    if (!user?.id) {
      setSettingsReady(false);
      setTheme("default");
      setView("front");
      return;
    }
    loadSettings(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!settingsReady || !user?.id) return;
    saveSettings(theme, view, selectedListId, user.id, uiState);
  }, [theme, view, selectedListId, settingsReady, user?.id, uiState]);

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
  const isFootballTheme = theme === "football";
  const SettingsGlyph = isFootballTheme ? PiSoccerBall : SettingsIcon;
  const heroSubtitle = isFootballTheme ? "How many goals are we scoring today?" : "What are we checking off today?";

  const getTaskNameById = (id) => todos.find((t) => t.id === id)?.text || null;
  const unlockedStorageKey = user?.id ? `unlockedThemes:${user.id}` : "unlockedThemes";
  const syncUnlockedFromInventory = (inventory = [], userId = user?.id, level = userLevel) => {
    const storageKey = userId ? `unlockedThemes:${userId}` : unlockedStorageKey;
    const inventoryList = parseInventory(inventory);
    let stored = [];
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      stored = Array.isArray(parsed) ? parsed : [];
    } catch {
      stored = [];
    }
    const levelUnlocked = getLevelUnlockedThemes(level);
    const merged = Array.from(new Set([...baseUnlockedThemes, ...stored, ...inventoryList, ...levelUnlocked]));
    const filtered = filterThemesByLevel(merged, level);
    setUnlockedThemes(filtered);
    try {
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch {
      // ignore storage failures
    }
    return filtered;
  };
  const handleLockedAttempt = () => {
    setLockedPromptOpen(true);
  };

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    try {
      syncUnlockedFromInventory(user?.inventory, user?.id, userLevel);
    } catch (err) {
      console.warn("Failed to load unlocked themes", err);
      setUnlockedThemes(filterThemesByLevel(baseUnlockedThemes, userLevel));
    }
  }, [unlockedStorageKey, user?.inventory, userLevel]);

  useEffect(() => {
    if (!user) return;
    const inventoryList = parseInventory(user.inventory);
    const levelUnlocked = getLevelUnlockedThemes(userLevel);
    const missing = levelUnlocked.filter((key) => !inventoryList.includes(key));
    if (missing.length === 0) return;
    const updatedInventory = [...inventoryList, ...missing];
    const updatedUser = { ...user, inventory: updatedInventory };
    setUser(updatedUser);
    localStorage.setItem("authUser", JSON.stringify(updatedUser));
    syncUnlockedFromInventory(updatedInventory, updatedUser.id, userLevel);
  }, [user, userLevel]);

  useEffect(() => {
    if (!settingsReady) return;
    if (!unlockedThemes.includes(theme)) {
      const fallback = baseUnlockedThemes[0] || "default";
      setTheme(fallback);
    }
  }, [theme, unlockedThemes, settingsReady]);

  async function loadSettings(userId) {
    try {
      const params = new URLSearchParams();
      if (userId) params.append("user_id", userId);
      const path = params.toString() ? `/settings?${params.toString()}` : "/settings";
      const data = await api.json(api.url(path));
      setTheme(data.theme || "default");
      setView(normalizeView(data.view));
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

  async function saveSettings(nextTheme, nextView, nextSelectedListId, userId, nextUiState) {
    try {
      await api.json(api.url("/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: nextTheme,
          view: nextView,
          selected_list_id: nextSelectedListId,
          user_id: userId,
          ui_state: nextUiState
        })
      });
    } catch (err) {
      console.error("Failed to save settings", err);
    }
  }

  const changeView = (nextView) => {
    setView(normalizeView(nextView));
  };

  const handleThemePurchase = async () => {
    if (!purchasePrompt) return;
    const themeKey = purchasePrompt.key;
    const item = themeStoreItems.find((entry) => entry.key === themeKey);
    if (!item) return;
    if (item.unlockLevel && userLevel < item.unlockLevel) {
      showNotice(`Reach level ${item.unlockLevel} to unlock ${item.label}.`);
      setPurchasePrompt(null);
      return;
    }
    if (item.purchasable === false) {
      showNotice(`${item.label} unlocks automatically at level ${item.unlockLevel || ""}.`);
      setPurchasePrompt(null);
      return;
    }
    if (!user?.id) {
      showNotice("Please sign in to purchase themes.");
      return;
    }
    if (unlockedThemes.includes(themeKey)) {
      showNotice(`${item.label} is already unlocked. Equip it to apply.`);
      return;
    }
    if (checkCoins < item.price) {
      showNotice("not enough check coins!");
      setCheckStoreOpen(true);
      setPurchasePrompt(null);
      return;
    }
    try {
      const res = await api.json(api.url("/store/purchase"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, item_key: themeKey, price: item.price })
      });
      const remaining = Number.isFinite(res?.check_coins) ? res.check_coins : Math.max(checkCoins - item.price, 0);
      setCheckCoins(remaining);
      const updatedUser = {
        ...user,
        check_coins: remaining,
        inventory: parseInventory(res?.inventory),
        titles: parseTitles(res?.titles ?? user?.titles)
      };
      setUser(updatedUser);
      localStorage.setItem("authUser", JSON.stringify(updatedUser));
      syncUnlockedFromInventory(updatedUser.inventory, updatedUser.id, updatedUser.level);
      setPurchasePrompt(null);
      showNotice(`${item.label} unlocked! Use Equip to apply.`);
    } catch (err) {
      let friendly = "Purchase failed";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          friendly = parsed?.detail || friendly;
        } catch {
          friendly = err.message;
        }
      }
      showNotice(friendly);
    }
  };

  const handleTitlePurchase = async () => {
    if (!titlePurchasePrompt) return;
    const titleKey = titlePurchasePrompt.key;
    const item = titleStoreItems.find((entry) => entry.key === titleKey);
    if (!item) return;
    if (item.unlockLevel && userLevel < item.unlockLevel) {
      showNotice(`Reach level ${item.unlockLevel} to unlock ${item.label}.`);
      setTitlePurchasePrompt(null);
      return;
    }
    if (item.purchasable === false) {
      showNotice(`${item.label} unlocks automatically at level ${item.unlockLevel || ""}.`);
      setTitlePurchasePrompt(null);
      return;
    }
    if (!user?.id) {
      showNotice("Please sign in to purchase titles.");
      return;
    }
    if (userTitles.includes(titleKey)) {
      showNotice(`${item.label} is already owned.`);
      setTitlePurchasePrompt(null);
      return;
    }
    if (checkCoins < item.price) {
      showNotice("not enough check coins!");
      setCheckStoreOpen(true);
      setTitlePurchasePrompt(null);
      return;
    }
    try {
      const res = await api.json(api.url("/store/purchase"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, item_key: `title:${titleKey}`, price: item.price })
      });
      const remaining = Number.isFinite(res?.check_coins) ? res.check_coins : Math.max(checkCoins - item.price, 0);
      const updatedTitles = parseTitles(res?.titles ?? userTitles);
      const updatedUser = {
        ...user,
        check_coins: remaining,
        inventory: parseInventory(res?.inventory),
        titles: updatedTitles
      };
      setUser(updatedUser);
      setCheckCoins(remaining);
      localStorage.setItem("authUser", JSON.stringify(updatedUser));
      showNotice(`${item.label} unlocked!`);
      setTitlePurchasePrompt(null);
    } catch (err) {
      let friendly = "Purchase failed";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          friendly = parsed?.detail || friendly;
        } catch {
          friendly = err.message;
        }
      }
      showNotice(friendly);
      setTitlePurchasePrompt(null);
    }
  };

  const handleEquipTitle = async (titleKey) => {
    if (!user?.id) {
      showNotice("Please sign in to equip titles.");
      return;
    }
    if (!userTitles.includes(titleKey)) {
      showNotice("Unlock this title before equipping it.");
      return;
    }
    try {
      const res = await api.json(api.url("/titles/equip"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, title_key: titleKey })
      });
      const updatedUser = {
        ...user,
        current_title: res?.current_title ?? titleKey
      };
      setUser(updatedUser);
      localStorage.setItem("authUser", JSON.stringify(updatedUser));
      showNotice("Title equipped.");
    } catch (err) {
      let friendly = "Unable to equip title";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          friendly = parsed?.detail || friendly;
        } catch {
          friendly = err.message;
        }
      }
      showNotice(friendly);
    }
  };

  const requestThemePurchase = (themeKey) => {
    const item = themeStoreItems.find((entry) => entry.key === themeKey);
    if (!item) return;
    if (item.unlockLevel && userLevel < item.unlockLevel) {
      showNotice(`Reach level ${item.unlockLevel} to unlock ${item.label}.`);
      return;
    }
    if (item.purchasable === false) {
      showNotice(`${item.label} unlocks automatically at level ${item.unlockLevel || ""}.`);
      return;
    }
    if (!user?.id) {
      showNotice("Please sign in to purchase themes.");
      return;
    }
    if (unlockedThemes.includes(themeKey)) {
      showNotice(`${item.label} is already unlocked. Equip it to apply.`);
      return;
    }
    if (checkCoins < item.price) {
      showNotice("not enough check coins!");
      setCheckStoreOpen(true);
      return;
    }
    setPurchasePrompt({ key: themeKey, label: item.label, price: item.price });
  };

  const requestTitlePurchase = (titleKey) => {
    const item = titleStoreItems.find((entry) => entry.key === titleKey);
    if (!item) return;
    if (item.unlockLevel && userLevel < item.unlockLevel) {
      showNotice(`Reach level ${item.unlockLevel} to unlock ${item.label}.`);
      return;
    }
    if (item.purchasable === false) {
      showNotice(`${item.label} unlocks automatically at level ${item.unlockLevel || ""}.`);
      return;
    }
    if (!user?.id) {
      showNotice("Please sign in to purchase titles.");
      return;
    }
    if (userTitles.includes(titleKey)) {
      showNotice(`${item.label} is already owned.`);
      return;
    }
    if (checkCoins < item.price) {
      showNotice("not enough check coins!");
      setCheckStoreOpen(true);
      return;
    }
    setTitlePurchasePrompt({ key: titleKey, label: item.label, price: item.price });
  };

  const handleEquipTheme = (themeKey) => {
    if (!unlockedThemes.includes(themeKey)) {
      showNotice("Unlock this theme before equipping it.");
      return;
    }
    setTheme(themeKey);
    const label = themes[themeKey]?.label || "Theme";
    showNotice(`${label} equipped.`);
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
      const res = await api.json(api.url(`/edit_a_todo?${params.toString()}`), { method: "PUT" });
      if (res?.user) {
        const mergedUser = {
          ...user,
          tasks_checked_off: Number.isFinite(res.user.tasks_checked_off) ? res.user.tasks_checked_off : user.tasks_checked_off,
          tasks_checked_off_today: Number.isFinite(res.user.tasks_checked_off_today) ? res.user.tasks_checked_off_today : user.tasks_checked_off_today,
          check_coins: Number.isFinite(res.user.check_coins) ? res.user.check_coins : user.check_coins,
          xp: Number.isFinite(res.user.xp) ? res.user.xp : user.xp,
          level: Number.isFinite(res.user.level) ? res.user.level : user.level,
          rank: res.user.rank || user.rank,
          inventory: parseInventory(res.user.inventory ?? user.inventory ?? []),
          titles: parseTitles(res.user.titles ?? user.titles ?? []),
          current_title: res.user.current_title ?? user.current_title ?? ""
        };
        setUser(mergedUser);
        setCheckCoins(mergedUser.check_coins || 0);
        localStorage.setItem("authUser", JSON.stringify(mergedUser));
        syncUnlockedFromInventory(mergedUser.inventory, mergedUser.id, mergedUser.level);
      }
      await loadTodos();
      if (selectedTodo?.id === id) {
        await selectTodo(id);
      }
    } catch (err) {
      console.error("Unable to update task", err);
      const message = err?.message?.includes("cannot be unchecked")
        ? "Completed tasks stay completed. If this was an error, you can delete and recreate the task."
        : err?.message || "Unable to update task";
      showNotice(message);
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
    const localFallback = todos.find((t) => t.id === id);
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
      console.error("Unable to load todo", err);
      if (localFallback) {
        if (localFallback.list_id && localFallback.list_id !== selectedListId) {
          setSelectedListId(localFallback.list_id);
        }
        setSelected(localFallback);
        changeView("detail");
        showNotice("Showing cached task due to a load error. Try refreshing if data seems outdated.");
      } else {
        showNotice(`Unable to load todo: ${err?.message || "Unknown error"}`);
      }
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
      const inventory = parseInventory(data.inventory);
      const titles = parseTitles(data.titles);
      const withSecret = {
        ...data,
        login_best: Number.isFinite(data.login_best) ? data.login_best : data.login_streak ?? 1,
        tasks_checked_off: Number.isFinite(data.tasks_checked_off) ? data.tasks_checked_off : 0,
        tasks_checked_off_today: Number.isFinite(data.tasks_checked_off_today) ? data.tasks_checked_off_today : 0,
        password,
        inventory,
        titles,
        current_title: data.current_title || "",
        xp: Number.isFinite(data.xp) ? data.xp : 0,
        level: Number.isFinite(data.level) ? data.level : 1,
        rank: data.rank || "Task Trainee",
        goals: Number.isFinite(data.goals) ? data.goals : 0
      };
      setUser(withSecret);
      setCheckCoins(withSecret.check_coins || 0);
      localStorage.setItem("authUser", JSON.stringify(withSecret));
      syncUnlockedFromInventory(inventory, withSecret?.id, withSecret.level);
      setAuthModalOpen(false);
      return withSecret;
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

  const handleLogout = () => {
    const storedUser = localStorage.getItem("authUser");
    if (!user && !storedUser) return;
    setUser(null);
    setCheckCoins(0);
    setTodos([]);
    setLists([]);
    setSelected(null);
    setSelectedListId(null);
    setSummary("Select a list to view its summary.");
    setRecommendations("Generate ideas related to the selected task.");
    setRelatedTodos([]);
    localStorage.removeItem("authUser");
    setShowSettings(false);
    setAuthModalOpen(true);
  };

  const parseCssValue = (value, axis) => {
    const trimmed = value.trim();
    if (trimmed.endsWith("vw")) {
      return (parseFloat(trimmed) / 100) * window.innerWidth;
    }
    if (trimmed.endsWith("vh")) {
      return (parseFloat(trimmed) / 100) * window.innerHeight;
    }
    if (trimmed.endsWith("px")) {
      return parseFloat(trimmed);
    }
    const fallback = parseFloat(trimmed);
    return Number.isNaN(fallback)
      ? axis === "x"
        ? window.innerWidth * 0.05
        : window.innerHeight * 0.05
      : fallback;
  };

  const updateBallBounds = () => {
    const styles = getComputedStyle(document.body);
    const left = parseCssValue(styles.getPropertyValue("--pitch-left"), "x");
    const right = parseCssValue(styles.getPropertyValue("--pitch-right"), "x");
    const top = parseCssValue(styles.getPropertyValue("--pitch-top"), "y");
    const bottom = parseCssValue(styles.getPropertyValue("--pitch-bottom"), "y");
    const size = parseCssValue(styles.getPropertyValue("--ball-size"), "x") || 36;
    const pitchWidth = Math.max(right - left, 1);
    const pitchHeight = Math.max(bottom - top, 1);
    const goalWidthRatio = 7.32 / 68;
    const goalHalfHeight = (pitchHeight * goalWidthRatio) / 2;
    const goalCenterY = top + pitchHeight / 2;
    const mapX = (value) => left + ((value - 50) / 900) * pitchWidth;
    const mapY = (value) => top + ((value - 30) / 540) * pitchHeight;
    ballBoundsRef.current = {
      minX: left,
      maxX: Math.max(left, right - size),
      minY: top,
      maxY: Math.max(top, bottom - size),
      size,
      goalMouth: {
        y1: goalCenterY - goalHalfHeight,
        y2: goalCenterY + goalHalfHeight
      },
      goalBoxes: {
        left: {
          x1: mapX(50),
          x2: mapX(110),
          y1: mapY(230),
          y2: mapY(370)
        },
        right: {
          x1: mapX(890),
          x2: mapX(950),
          y1: mapY(230),
          y2: mapY(370)
        }
      }
    };
  };

  const boostBall = () => {
    const speed = 14;
    const angle = Math.random() * Math.PI * 2;
    const minAxis = 1.8;
    const nextVx = Math.cos(angle) * speed;
    const nextVy = Math.sin(angle) * speed;
    ballStateRef.current.vx = Math.abs(nextVx) < minAxis ? Math.sign(nextVx || 1) * minAxis : nextVx;
    ballStateRef.current.vy = Math.abs(nextVy) < minAxis ? Math.sign(nextVy || 1) * minAxis : nextVy;
  };

  const triggerGoalExplosion = (x, y) => {
    const id = goalExplosionIdRef.current++;
    setGoalExplosions((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setGoalExplosions((prev) => prev.filter((entry) => entry.id !== id));
    }, 900);
  };

  const recordGoal = async () => {
    const currentUser = userRef.current;
    if (!currentUser?.id) return;
    try {
      const data = await api.json(api.url("/goals/score"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      if (typeof data?.goals === "number") {
        const updatedUser = { ...currentUser, goals: data.goals };
        setUser(updatedUser);
        localStorage.setItem("authUser", JSON.stringify(updatedUser));
      }
    } catch (err) {
      console.error("Failed to record goal", err);
    }
  };

  useEffect(() => {
    if (theme !== "football") {
      if (ballRafRef.current) cancelAnimationFrame(ballRafRef.current);
      ballRafRef.current = null;
      return;
    }

    const ball = ballRef.current;
    if (!ball) return;

    updateBallBounds();
    const bounds = ballBoundsRef.current;
    ballStateRef.current = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      vx: ballStateRef.current.vx || 4,
      vy: ballStateRef.current.vy || 2
    };
    ballLastTimeRef.current = 0;

    const animate = (time) => {
      if (!ballRef.current) return;
      if (!ballLastTimeRef.current) ballLastTimeRef.current = time;
      const dt = Math.min(2, (time - ballLastTimeRef.current) / 16.67);
      ballLastTimeRef.current = time;

      const state = ballStateRef.current;
      const prevX = state.x;
      const prevY = state.y;
      const boundsNow = ballBoundsRef.current;
      const friction = 0.99;
      const minAxisSpeed = 1.05;
      const minSpeed = 1.8;
      const maxSpeed = 14;
      const frictionFactor = Math.pow(friction, dt);

      state.vx *= frictionFactor;
      state.vy *= frictionFactor;
      if (Math.abs(state.vx) < minAxisSpeed) state.vx = Math.sign(state.vx || 1) * minAxisSpeed;
      if (Math.abs(state.vy) < minAxisSpeed) state.vy = Math.sign(state.vy || 1) * minAxisSpeed;
      const speed = Math.hypot(state.vx, state.vy);
      if (speed < minSpeed) {
        const scale = minSpeed / (speed || minSpeed);
        state.vx *= scale;
        state.vy *= scale;
      } else if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        state.vx *= scale;
        state.vy *= scale;
      }
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      const maybeTriggerGoal = (hitX, hitY) => {
        triggerGoalExplosion(hitX, hitY);
        recordGoal();
      };

      if (state.x <= boundsNow.minX) {
        state.x = boundsNow.minX;
        state.vx = Math.abs(state.vx);
      }
      if (state.x >= boundsNow.maxX) {
        state.x = boundsNow.maxX;
        state.vx = -Math.abs(state.vx);
      }
      if (state.y <= boundsNow.minY) {
        state.y = boundsNow.minY;
        state.vy = Math.abs(state.vy);
      }
      if (state.y >= boundsNow.maxY) {
        state.y = boundsNow.maxY;
        state.vy = -Math.abs(state.vy);
      }

      const radius = boundsNow.size / 2;
      const nextCx = state.x + radius;
      const nextCy = state.y + radius;
      if (boundsNow.goalBoxes) {
        const leftLineX = boundsNow.minX;
        const rightLineX = boundsNow.maxX + boundsNow.size;
        const boundaryTolerance = 0.5;
        const touchesLeftLine = Math.abs(state.x - leftLineX) <= boundaryTolerance;
        const touchesRightLine = Math.abs(state.x + boundsNow.size - rightLineX) <= boundaryTolerance;
        const ballTop = state.y;
        const ballBottom = state.y + boundsNow.size;
        const leftBox = boundsNow.goalBoxes.left;
        const rightBox = boundsNow.goalBoxes.right;
        const overlapsLeftBoxY = ballBottom >= leftBox.y1 && ballTop <= leftBox.y2;
        const overlapsRightBoxY = ballBottom >= rightBox.y1 && ballTop <= rightBox.y2;
        const leftContact = touchesLeftLine && overlapsLeftBoxY;
        const rightContact = touchesRightLine && overlapsRightBoxY;
        if (leftContact && !goalLineContactRef.current.left) {
          goalLineContactRef.current.left = true;
          maybeTriggerGoal(leftLineX, nextCy);
        } else if (!leftContact) {
          goalLineContactRef.current.left = false;
        }
        if (rightContact && !goalLineContactRef.current.right) {
          goalLineContactRef.current.right = true;
          maybeTriggerGoal(rightLineX, nextCy);
        } else if (!rightContact) {
          goalLineContactRef.current.right = false;
        }
      }
      ballRef.current.style.transform = `translate(${state.x}px, ${state.y}px)`;
      ballRafRef.current = requestAnimationFrame(animate);
    };

    ballRafRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      updateBallBounds();
      const boundsNext = ballBoundsRef.current;
      ballStateRef.current.x = Math.min(Math.max(ballStateRef.current.x, boundsNext.minX), boundsNext.maxX);
      ballStateRef.current.y = Math.min(Math.max(ballStateRef.current.y, boundsNext.minY), boundsNext.maxY);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (ballRafRef.current) cancelAnimationFrame(ballRafRef.current);
      ballRafRef.current = null;
    };
  }, [theme]);

  if (!user) {
    return (
      <ErrorBoundary>
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
            onUser={(u) => {
              setCheckCoins(u?.check_coins || 0);
            }}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {theme === "football" ? (
        <div className="football-ball-layer" aria-hidden="true">
          <div className="goal-line left" aria-hidden="true"></div>
          <div className="goal-line right" aria-hidden="true"></div>
          {goalExplosions.map((explosion) => (
            <div
              key={explosion.id}
              className="goal-explosion"
              style={{ left: explosion.x, top: explosion.y }}
            >
              Goal!!!
            </div>
          ))}
          <button
            type="button"
            className="football-ball"
            ref={ballRef}
            onClick={boostBall}
            aria-label="Boost soccer ball"
          >
            <PiSoccerBall className="football-ball-icon" />
          </button>
        </div>
      ) : null}
      <div className="app">
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="toast-close" onClick={() => setNotice(null)} aria-label="Close notice">
            ×
          </button>
        </div>
      )}
      <div className="help-launcher-stack">
        <div
          className="help-launcher-area"
          onMouseEnter={() => {
            if (coinsOpen) setCoinsOpen(false);
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
            <div
              className="help-dropdown"
              onMouseEnter={() => {
                if (closeHelpTimeout) clearTimeout(closeHelpTimeout);
                setHelpOpen(true);
              }}
              onMouseLeave={() => {
                const timeout = setTimeout(() => setHelpOpen(false), 120);
                setCloseHelpTimeout(timeout);
              }}
            >
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
        </div>
        <button
          className="shop-button"
          type="button"
          onClick={() => {
            setHelpOpen(false);
            setCoinsOpen(false);
            setCheckStoreOpen(true);
          }}
          aria-label="Open shop"
          title="Shop"
        >
          <ShoppingCart size={16} aria-hidden="true" />
        </button>
        <div
          className="coins-wrapper"
          onMouseEnter={() => {
            setHelpOpen(false);
            if (closeCoinsTimeout) clearTimeout(closeCoinsTimeout);
            setCoinsOpen(true);
          }}
          onMouseLeave={() => {
            const timeout = setTimeout(() => setCoinsOpen(false), 120);
            setCloseCoinsTimeout(timeout);
          }}
        >
          <div
            className="coins-card"
            aria-label="Check coins"
            onClick={() => {
              setHelpOpen(false);
              setCoinsOpen((o) => !o);
            }}
          >
            <Coins className="coins-icon" aria-hidden="true" />
            <div className="coins-meta">
              <span className="coins-label">Check coins</span>
              <span className="coins-value">{checkCoins}</span>
            </div>
          </div>
          {coinsOpen && (
            <div
              className="coins-dropdown"
              onMouseEnter={() => {
                if (closeCoinsTimeout) clearTimeout(closeCoinsTimeout);
                setCoinsOpen(true);
              }}
              onMouseLeave={() => {
                const timeout = setTimeout(() => setCoinsOpen(false), 120);
                setCloseCoinsTimeout(timeout);
              }}
            >
              <button
                className="nav-button full"
                type="button"
                onClick={() => {
                  setCoinsOpen(false);
                  setCoinsInfoOpen(true);
                }}
              >
                How to get Check Coins?
              </button>
            </div>
          )}
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
                <SettingsGlyph className="gear-icon" aria-hidden="true" />
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
                          {Object.entries(themes).map(([key, info]) => {
                            const locked = !unlockedThemes.includes(key);
                            return (
                              <button
                                key={key}
                                className={`dropdown-theme-option ${theme === key ? "active" : ""} ${locked ? "locked" : ""}`}
                                onClick={() => {
                                  if (locked) {
                                    handleLockedAttempt();
                                    return;
                                  }
                                  setTheme(key);
                                }}
                                role="option"
                                aria-disabled={locked}
                                disabled={locked}
                              >
                                <span
                                  className="theme-chip"
                                  style={{ background: themePreviews[key]?.bg, borderColor: themePreviews[key]?.border }}
                                />
                                {locked ? <Lock size={14} className="theme-lock" aria-hidden="true" /> : null}
                                <span>{info.label}</span>
                              </button>
                            );
                          })}
                            </div>
                          )}
                        </div>
                      </div>
                  <button className="nav-button full" onClick={() => setShowSettings(true)}>
                    Open settings <SettingsGlyph className="menu-icon" aria-hidden="true" />
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
            <section
              className={`${view === "front" ? "active" : ""} ${user?.current_title === "collector" ? "collector-glow-gold" : ""}`.trim()}
              id="front"
            >
              <div className="hero">
                <h2 className="hero-title">Welcome, {user?.username || "friend"}!</h2>
                {user?.current_title ? (
                  <p
                    className={`hero-title-tag ${
                      user.current_title === "holy-temple" || user.current_title === "collector" ? "glow-gold" : "glow"
                    }`.trim()}
                  >
                    {titleLabelByKey[user.current_title] || user.current_title}
                  </p>
                ) : null}
                <p className="hero-subtitle">{heroSubtitle}</p>
                {isFootballTheme ? <p className="hero-goals">Total goals: {user?.goals ?? 0}</p> : null}
              </div>
              <div className="tasks-summary">
                <div className="panel tasks-card">
                  <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "15px" }}>Tasks checked off</label>
                  <div className="tasks-count">{tasksCheckedOff}</div>
                </div>
                <div className="panel tasks-card">
                  <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "15px" }}>Tasks checked off today</label>
                  <div className="tasks-count">{tasksCheckedOffToday}</div>
                </div>
              </div>
              <div className="panel xp-card">
                <div className="xp-header">
                  <div className="xp-label">
                    <Sparkles size={18} />
                    <span>XP Progress</span>
                  </div>
                  <span className="xp-percent">{xpProgress}%</span>
                </div>
                <div className="xp-bar" aria-label="XP progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xpProgress}>
                  <div className="xp-bar-fill" style={{ width: `${xpProgress}%` }} />
                </div>
                <div className="xp-level">
                  <Crown size={18} />
                  <span>Level {userLevel}</span>
                </div>
                <div className="xp-rank">
                  <span className="xp-rank-label">Rank</span>
                  <span className="xp-rank-value">{userRank}</span>
                </div>
                <div className="xp-rank">
                  <span className="xp-rank-label">Items collected</span>
                  <span className="xp-rank-value">{itemsCollectedLabel}</span>
                </div>
              </div>
              <div className="front-streak">
                <div className="panel streak-card">
                  <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Login streak</label>
                  <div style={{ fontWeight: 700, fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>{loginStreak} day{loginStreak === 1 ? "" : "s"}</span>
                    <Flame size={18} color="var(--accent)" />
                  </div>
                </div>
                <div className="panel streak-card">
                  <label className="muted" style={{ display: "block", marginBottom: "6px" }}>Best login streak</label>
                  <div style={{ fontWeight: 700, fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>{loginBest} day{loginBest === 1 ? "" : "s"}</span>
                    <Flame size={18} color="var(--accent)" />
                  </div>
                </div>
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
              <div className="panel create-list-panel">
                <form className="create-list-form" onSubmit={createList}>
                  <label className="create-list-label" htmlFor="listName">Create a list</label>
                  <input id="listName" name="listName" type="text" placeholder="List name" required />
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
                              <button className="button secondary" onClick={loadRelated}>Show related tasks</button>
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
        unlockedThemes={unlockedThemes}
        onLockedThemeAttempt={handleLockedAttempt}
        onLogout={() => setConfirmLogoutOpen(true)}
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
      <CoinsInfoModal
        open={coinsInfoOpen}
        onClose={() => setCoinsInfoOpen(false)}
        onOpenStore={() => {
          setCoinsInfoOpen(false);
          setCheckStoreOpen(true);
        }}
        loginStreak={user?.login_streak || 0}
      />
      <ConfirmModal
        className="confirm"
        open={confirmLogoutOpen}
        title="Log out?"
        message="Log out of your account?"
        confirmLabel="Log out"
        cancelLabel="Stay signed in"
        destructive
        onCancel={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          handleLogout();
        }}
      />
      <ConfirmModal
        className="confirm"
        open={Boolean(purchasePrompt)}
        title="Confirm purchase"
        message={
          purchasePrompt
            ? `Buy ${purchasePrompt.label} for ${purchasePrompt.price} check coins?`
            : ""
        }
        confirmLabel="Buy"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setPurchasePrompt(null)}
        onConfirm={() => handleThemePurchase()}
      />
      <ConfirmModal
        className="confirm"
        open={Boolean(titlePurchasePrompt)}
        title="Confirm purchase"
        message={
          titlePurchasePrompt
            ? `Buy ${titlePurchasePrompt.label} for ${titlePurchasePrompt.price} check coins?`
            : ""
        }
        confirmLabel="Buy"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setTitlePurchasePrompt(null)}
        onConfirm={() => handleTitlePurchase()}
      />
      <CheckStoreModal
        open={checkStoreOpen}
        onClose={() => setCheckStoreOpen(false)}
        coins={checkCoins}
        items={themeStoreItems}
        titleItems={titleStoreItems}
        onPurchase={requestThemePurchase}
        onTitlePurchase={requestTitlePurchase}
        unlockedThemes={unlockedThemes}
        ownedTitles={userTitles}
        currentTitle={user?.current_title || ""}
        onEquipTitle={handleEquipTitle}
        currentTheme={theme}
        userLevel={userLevel}
        inventoryCount={Array.isArray(user?.inventory) ? user.inventory.length : 0}
        onEquip={handleEquipTheme}
      />
      <LockedItemModal
        open={lockedPromptOpen}
        onClose={() => setLockedPromptOpen(false)}
        onOpenShop={() => {
          setLockedPromptOpen(false);
          setCheckStoreOpen(true);
        }}
      />
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
    </ErrorBoundary>
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

function FlagStack({ count = 0 }) {
  const safeCount = Number.isFinite(count) ? count : 0;
  if (safeCount <= 0) return null;
  const dots = Math.min(safeCount, 3);
  return (
    <div className="flag-stack" aria-label={`${safeCount} flag${safeCount === 1 ? "" : "s"}`}>
      {Array.from({ length: dots }).map((_, idx) => (
        <span key={idx} className="flag-dot" aria-hidden="true" />
      ))}
      <span className="flag-count">{safeCount}</span>
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
          <button className="button secondary action-uniform" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Open</button>
          <button className="ghost action-uniform" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>
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

function SettingsPanel({ open, onClose, theme, setTheme, user, setUser, unlockedThemes = [], onLockedThemeAttempt, onLogout }) {
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
              {Object.entries(themes).map(([key, info]) => {
                const locked = !unlockedThemes.includes(key);
                return (
                  <button
                    key={key}
                    className={`theme-option ${theme === key ? "active" : ""} ${locked ? "locked" : ""}`}
                    role="option"
                    aria-disabled={locked}
                    disabled={locked}
                    onClick={() => {
                      if (locked) {
                        if (onLockedThemeAttempt) onLockedThemeAttempt();
                        return;
                      }
                      chooseTheme(key);
                    }}
                  >
                    <span
                      className="theme-chip"
                      style={{ background: themePreviews[key]?.bg, borderColor: themePreviews[key]?.border }}
                    />
                    {locked ? <Lock size={14} className="theme-lock" aria-hidden="true" /> : null}
                    <span>{info.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        setUser={setUser}
        theme={theme}
        onLogout={() => {
          setProfileOpen(false);
          if (onLogout) onLogout();
        }}
      />
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

function ConfirmModal({
  className = "",
  open,
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null;
  return (
    <div className={`modal ${className}`.trim()}>
      <div className="modal-backdrop" onClick={onCancel} aria-hidden="true"></div>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
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
        <h3 id="confirm-title" style={{ marginTop: 0 }}>{title}</h3>
        {message ? <p className="muted" style={{ marginTop: "4px" }}>{message}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
          <button type="button" className="button secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`button ${destructive ? "danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
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
        className="flag-trigger action-uniform"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flag-text">Priority</span>
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
              <span className="flag-label">{count === 0 ? "No priority" : `${count} flag${count === 1 ? "" : "s"}`}</span>
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

function ProfileModal({ open, onClose, user, setUser, onLogout, theme }) {
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

  const handleLogoutClick = () => {
    handleCloseAll();
    if (onLogout) onLogout();
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
          <div
            className="panel logout-panel"
            style={{
              marginTop: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <div>
              {theme === "football" ? (
                <div style={{ fontWeight: 600 }}>Red card:</div>
              ) : (
                <>
                  <div style={{ fontWeight: 600 }}>Log out</div>
                  <div className="muted">You will need to sign back in to access your tasks.</div>
                </>
              )}
            </div>
            <button
              type="button"
              className="button danger logout-button"
              onClick={handleLogoutClick}
              aria-label="Log out"
            >
              {theme === "football" ? null : "Log out"}
            </button>
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
function CoinsInfoModal({ open, onClose, onOpenStore, loginStreak = 0 }) {
  if (!open) return null;
  const milestones = [
    { key: "daily", title: "Daily check-in", detail: "+10 coins every time your streak increases", pill: "+10/day", threshold: 1 },
    { key: "streak5", title: "5-day streak", detail: "Bonus when you hit 5 days", pill: "+20 bonus", threshold: 5 },
    { key: "streak10", title: "10-day streak", detail: "Bonus when you hit 10 days", pill: "+50 bonus", threshold: 10 },
    { key: "streak20", title: "20-day streak", detail: "Bonus when you hit 20 days", pill: "+100 bonus", threshold: 20 },
    { key: "streak50", title: "50-day streak", detail: "Bonus when you hit 50 days", pill: "+300 bonus", threshold: 50 }
  ];
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coins-info-title"
        style={{ width: "min(520px, 94vw)", padding: "26px" }}
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
        <h3 id="coins-info-title" style={{ textAlign: "center", marginBottom: "8px", fontSize: "22px" }}>
          How to get Check Coins?
        </h3>
        <p
          className="muted"
          style={{
            textAlign: "center",
            margin: "0 0 18px",
            padding: "10px 14px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(31,75,255,0.08), rgba(87,204,255,0.08))",
            color: "var(--text)"
          }}
        >
          Track your streak and see exactly how coins add up.
        </p>
        <div
          className="panel"
          style={{
            padding: "16px",
            marginBottom: "12px",
            background: "linear-gradient(135deg, rgba(31,75,255,0.12), rgba(87,204,255,0.12))",
            border: "1px solid var(--accent-soft)",
            boxShadow: "0 16px 38px rgba(31, 75, 255, 0.16)"
          }}
        >
          <div className="coins-info-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", color: "var(--text)" }}>
            <span>Current login streak</span>
            <Flame size={18} color="var(--accent)" />
          </div>
          <div className="coins-info-value" style={{ fontSize: "18px", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text)" }}>
            <span>{loginStreak} day{loginStreak === 1 ? "" : "s"}</span>
            <span style={{ fontWeight: 700, color: "var(--accent)", background: "rgba(255,255,255,0.6)", padding: "6px 10px", borderRadius: "12px", boxShadow: "0 6px 14px rgba(0,0,0,0.08)" }}>
              {loginStreak * 10}+ coins earned
            </span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: "8px", background: "var(--panel)", padding: "14px 16px", lineHeight: 1.6, border: "1px solid var(--accent-soft)", boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)" }}>
          <div style={{ fontWeight: 700, marginBottom: "10px", color: "var(--text)" }}>Milestones timeline</div>
          <div className="coins-timeline">
            {milestones.map((item, idx) => {
              const active = loginStreak >= item.threshold;
              const isLast = idx === milestones.length - 1;
              return (
                <div key={item.key} className={`coins-timeline-item ${active ? "active" : ""}`}>
                  <div className="coins-timeline-track">
                    <span className="coins-timeline-dot" aria-hidden="true" />
                    {!isLast && <span className="coins-timeline-line" aria-hidden="true" />}
                  </div>
                  <div className="coins-timeline-content">
                    <div className="coins-timeline-header">
                      <span className="coins-timeline-title">{item.title}</span>
                      <span className="coins-timeline-pill">{item.pill}</span>
                    </div>
                    <div className="coins-timeline-detail">{item.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: "18px", justifyContent: "center" }}>
          <button
            className="button"
            type="button"
            style={{ minWidth: "150px" }}
            onClick={onOpenStore}
          >
            Shop
          </button>
        </div>
      </div>
    </div>
  );
}
function CheckStoreModal({
  open,
  onClose,
  coins = 0,
  items = [],
  titleItems = [],
  onPurchase,
  onTitlePurchase,
  unlockedThemes = [],
  ownedTitles = [],
  currentTitle = "",
  onEquipTitle,
  currentTheme,
  onEquip,
  userLevel = 1,
  inventoryCount = 0
}) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content check-store-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-store-title"
        style={{ width: "min(880px, 94vw)", padding: "26px" }}
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
        <h3 id="check-store-title" style={{ textAlign: "center", marginBottom: "8px", fontSize: "22px" }}>
          Check Store
        </h3>
        <p className="muted" style={{ textAlign: "center", margin: "0 0 12px" }}>
          Spend your check coins on exclusive themes and titles. Some unlock automatically when you reach new levels!
        </p>
        <div className="check-store-grid wide">
          <div className="check-store-column">
            <div className="panel" style={{ padding: "12px", background: "var(--panel)", border: "1px solid var(--accent-soft)", display: "grid", gap: "10px" }}>
              <div className="muted" style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Themes
              </div>
              {items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "10px",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid color-mix(in srgb, var(--accent-soft) 60%, var(--panel) 40%)",
                    background: "color-mix(in srgb, var(--panel) 92%, var(--accent-soft) 8%)"
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--text)" }}>
                      <span>{item.label} (theme)</span>
                      <span
                        className="theme-chip"
                        aria-hidden="true"
                        style={{
                          background: themePreviews[item.key]?.bg,
                          borderColor: themePreviews[item.key]?.border,
                          width: "28px",
                          height: "28px"
                        }}
                      />
                    </div>
                    <div className="muted" style={{ fontSize: "13px" }}>{item.description}</div>
                    {item.unlockLevel ? (
                      <div className="muted" style={{ fontSize: "12px" }}>
                        Unlocks at level {item.unlockLevel} {item.purchasable === false ? "(auto-unlocks)" : ""}
                      </div>
                    ) : null}
                  </div>
                  {(() => {
                    const unlocked = unlockedThemes.includes(item.key);
                    const lockedByLevel = item.unlockLevel && userLevel < item.unlockLevel;
                    const purchasable = item.purchasable !== false;
                    const buttonDisabled = currentTheme === item.key || (!unlocked && (!purchasable || lockedByLevel));
                    let buttonLabel = `Buy for ${item.price} CC`;
                    if (unlocked) {
                      buttonLabel = currentTheme === item.key ? "Equipped" : "Equip";
                    } else if (!purchasable) {
                      buttonLabel = lockedByLevel ? `Reach level ${item.unlockLevel}` : "Unlocking...";
                    } else if (lockedByLevel) {
                      buttonLabel = `Reach level ${item.unlockLevel}`;
                    }
                    return (
                      <button
                        className={`button secondary ${currentTheme === item.key ? "active" : ""}`}
                        type="button"
                        onClick={async () => {
                          if (unlocked) {
                            if (currentTheme === item.key) return;
                            if (onEquip) onEquip(item.key);
                            return;
                          }
                          if (!purchasable || lockedByLevel) return;
                          if (onPurchase) {
                            await onPurchase(item.key);
                          }
                        }}
                        style={{ minWidth: "150px" }}
                        disabled={buttonDisabled}
                      >
                        {buttonLabel}
                      </button>
                    );
                  })()}
                </div>
              ))}
            </div>
            <div className="shop-placeholder">
              <div className="shop-placeholder-title">More themes coming soon!</div>
              <div className="shop-placeholder-text">
                We are cooking up new looks to keep your checklist fresh. Stay tuned for the next drop.
              </div>
            </div>
          </div>
          <div className="panel" style={{ padding: "12px", background: "var(--panel)", border: "1px solid var(--accent-soft)", display: "grid", gap: "10px" }}>
          <div className="muted" style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Titles
          </div>
          {titleItems.map((item) => (
            <div
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "10px",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid color-mix(in srgb, var(--accent-soft) 60%, var(--panel) 40%)",
                background: "color-mix(in srgb, var(--panel) 92%, var(--accent-soft) 8%)"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.label}</div>
                <div className="muted" style={{ fontSize: "13px" }}>{item.description}</div>
                {item.unlockLevel ? (
                  <div className="muted" style={{ fontSize: "12px" }}>
                    Unlocks at level {item.unlockLevel} {item.purchasable === false ? "(auto-unlocks)" : ""}
                  </div>
                ) : null}
              </div>
              {(() => {
                const owned = ownedTitles.includes(item.key) || currentTitle === item.key;
                const lockedByLevel = item.unlockLevel && userLevel < item.unlockLevel;
                const meetsInventoryUnlock = item.unlockInventory && inventoryCount >= item.unlockInventory;
                const lockedByInventory = item.unlockInventory && !meetsInventoryUnlock;
                const effectiveOwned = owned || meetsInventoryUnlock;
                const purchasable = item.purchasable !== false && Number.isFinite(item.price);
                const lockedByRequirement = lockedByLevel || lockedByInventory;
                const buttonDisabled =
                  (effectiveOwned && currentTitle === item.key) || (!effectiveOwned && (!purchasable || lockedByRequirement));
                let buttonLabel = `Buy for ${item.price} CC`;
                if (effectiveOwned) {
                  buttonLabel = currentTitle === item.key ? "Equipped" : "Equip";
                } else if (!purchasable) {
                  if (lockedByLevel) {
                    buttonLabel = `Reach level ${item.unlockLevel}`;
                  } else if (lockedByInventory) {
                    buttonLabel = `Collect ${item.unlockInventory} items`;
                  } else {
                    buttonLabel = "Unlocked";
                  }
                } else if (lockedByRequirement) {
                  buttonLabel = lockedByLevel ? `Reach level ${item.unlockLevel}` : `Collect ${item.unlockInventory} items`;
                }
                return (
                  <button
                    className={`button secondary ${currentTitle === item.key ? "active" : ""}`}
                    type="button"
                    onClick={async () => {
                      if (effectiveOwned) {
                        if (currentTitle === item.key) return;
                        if (onEquipTitle) await onEquipTitle(item.key);
                        return;
                      }
                      if (!purchasable || lockedByRequirement) return;
                      if (onTitlePurchase) {
                        await onTitlePurchase(item.key);
                      }
                    }}
                    style={{ minWidth: "150px" }}
                    disabled={buttonDisabled}
                  >
                    {buttonLabel}
                  </button>
                );
              })()}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedItemModal({ open, onClose, onOpenShop }) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true"></div>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="locked-title"
        style={{ width: "min(360px, 92vw)" }}
      >
        <h3 id="locked-title" style={{ textAlign: "center", marginBottom: "8px" }}>item avaliable in shop</h3>
        <p className="muted" style={{ textAlign: "center", margin: "0 0 12px" }}>
          Unlock this theme from the Check Store.
        </p>
        <div className="modal-actions" style={{ justifyContent: "center" }}>
          <button className="button" type="button" onClick={onOpenShop} style={{ minWidth: "120px" }}>
            Shop
          </button>
          <button className="button secondary" type="button" onClick={onClose} style={{ minWidth: "120px" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
function AuthModal({ open, mode, onModeChange, onSubmit, loading, error, onUser }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);

  useEffect(() => {
    setUsername("");
    setPassword("");
  }, [mode, open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const maybePromise = onSubmit(username, password);
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then((userData) => {
        if (userData && onUser) onUser(userData);
      });
    }
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
