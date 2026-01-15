import os
from typing import Optional
from datetime import datetime

from libsql_experimental import create_client


class TursoCursor:
    def __init__(self, result):
        self._rows = _rows_to_dicts(result)
        self._index = 0
        self.rowcount = result.rows_affected or 0
        self.lastrowid = result.last_insert_rowid

    def fetchone(self):
        if self._index >= len(self._rows):
            return None
        row = self._rows[self._index]
        self._index += 1
        return row

    def fetchall(self):
        if self._index == 0:
            self._index = len(self._rows)
            return list(self._rows)
        rows = self._rows[self._index:]
        self._index = len(self._rows)
        return list(rows)


class TursoConnection:
    def __init__(self, client):
        self._client = client

    def execute(self, sql: str, params: tuple | list | dict | None = None) -> TursoCursor:
        result = self._client.execute(sql, params or ())
        return TursoCursor(result)

    def commit(self) -> None:
        # Turso executes statements immediately; commit is a no-op for compatibility.
        return None

    def close(self) -> None:
        self._client.close()


def _rows_to_dicts(result) -> list[dict]:
    if not result.rows:
        return []
    columns = result.columns or []
    return [dict(zip(columns, row)) for row in result.rows]


def connect() -> TursoConnection:
    """Create a Turso client connection using environment credentials."""
    url = os.getenv("TURSO_DATABASE_URL")
    token = os.getenv("TURSO_AUTH_TOKEN")
    if not url or not token:
        raise RuntimeError("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.")
    client = create_client(url, auth_token=token)
    return TursoConnection(client)


def create_table(conn: TursoConnection) -> None:
    """Create the todos table if it does not already exist."""
    create_users_table(conn)
    create_lists_table(conn)
    create_settings_table(conn)
    create_todos_table(conn)
    ensure_default_user(conn)


def create_lists_table(conn: TursoConnection) -> None:
    """Create the lists table and ensure a default list row."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1
        );
    """)
    # Ensure a default list exists
    cursor = conn.execute("SELECT COUNT(*) as count FROM lists;")
    count = cursor.fetchone()["count"]
    if count == 0:
        conn.execute("INSERT INTO lists (id, name, user_id) VALUES (1, 'Default List', 1);")
    # Add user_id column if upgrading
    cursor = conn.execute("PRAGMA table_info(lists);")
    cols = [row["name"] for row in cursor.fetchall()]
    if "user_id" not in cols:
        conn.execute("ALTER TABLE lists ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;")
        conn.execute("UPDATE lists SET user_id = 1 WHERE user_id IS NULL;")
    conn.commit()


def create_todos_table(conn: TursoConnection) -> None:
    """Create todos table with list_id support or migrate existing schema."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            related_id INTEGER,
            list_id INTEGER NOT NULL DEFAULT 1,
            deadline TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            flags INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
        );
    """)
    # If table already existed, ensure list_id column exists
    cursor = conn.execute("PRAGMA table_info(todos);")
    cols = [row["name"] for row in cursor.fetchall()]
    if "list_id" not in cols:
        conn.execute("ALTER TABLE todos ADD COLUMN list_id INTEGER NOT NULL DEFAULT 1;")
    # Backfill any NULL list_id to default list
    conn.execute("UPDATE todos SET list_id = 1 WHERE list_id IS NULL;")
    if "deadline" not in cols:
        conn.execute("ALTER TABLE todos ADD COLUMN deadline TEXT;")
    if "completed" not in cols:
        conn.execute("ALTER TABLE todos ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;")
        conn.execute("UPDATE todos SET completed = 0 WHERE completed IS NULL;")
    if "flags" not in cols:
        conn.execute("ALTER TABLE todos ADD COLUMN flags INTEGER NOT NULL DEFAULT 0;")
        conn.execute("UPDATE todos SET flags = 0 WHERE flags IS NULL;")
    conn.commit()


def create_users_table(conn: TursoConnection) -> None:
    """Create users table for simple auth."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            login_streak INTEGER NOT NULL DEFAULT 0,
            login_best INTEGER NOT NULL DEFAULT 1,
            tasks_checked_off INTEGER NOT NULL DEFAULT 0,
            tasks_checked_off_today INTEGER NOT NULL DEFAULT 0,
            tasks_checked_off_date TEXT,
            last_login TEXT,
            check_coins INTEGER NOT NULL DEFAULT 0,
            theme TEXT NOT NULL DEFAULT 'default',
            view TEXT NOT NULL DEFAULT 'front',
            ui_state TEXT NOT NULL DEFAULT '{}',
            inventory TEXT NOT NULL DEFAULT '[]',
            titles TEXT NOT NULL DEFAULT '[]',
            current_title TEXT NOT NULL DEFAULT '',
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            rank TEXT NOT NULL DEFAULT 'Task Trainee',
            goals INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    # Add columns for login tracking if they are missing (migration).
    cursor = conn.execute("PRAGMA table_info(users);")
    cols = [row["name"] for row in cursor.fetchall()]
    if "login_streak" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN login_streak INTEGER NOT NULL DEFAULT 0;")
    if "login_best" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN login_best INTEGER NOT NULL DEFAULT 1;")
        conn.execute("UPDATE users SET login_best = CASE WHEN login_streak > 1 THEN login_streak ELSE 1 END;")
    if "tasks_checked_off" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN tasks_checked_off INTEGER NOT NULL DEFAULT 0;")
    if "tasks_checked_off_today" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN tasks_checked_off_today INTEGER NOT NULL DEFAULT 0;")
    if "tasks_checked_off_date" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN tasks_checked_off_date TEXT;")
    if "last_login" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN last_login TEXT;")
    if "check_coins" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN check_coins INTEGER NOT NULL DEFAULT 0;")
    if "theme" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'default';")
    if "view" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN view TEXT NOT NULL DEFAULT 'front';")
    if "ui_state" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN ui_state TEXT NOT NULL DEFAULT '{}';")
        conn.execute("UPDATE users SET ui_state = '{}' WHERE ui_state IS NULL;")
    if "inventory" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN inventory TEXT NOT NULL DEFAULT '[]';")
        conn.execute("UPDATE users SET inventory = '[]' WHERE inventory IS NULL;")
    if "titles" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN titles TEXT NOT NULL DEFAULT '[]';")
        conn.execute("UPDATE users SET titles = '[]' WHERE titles IS NULL;")
    if "current_title" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN current_title TEXT NOT NULL DEFAULT '';")
        conn.execute("UPDATE users SET current_title = '' WHERE current_title IS NULL;")
    if "xp" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;")
        conn.execute("UPDATE users SET xp = 0 WHERE xp IS NULL;")
    if "level" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1;")
        conn.execute("UPDATE users SET level = 1 WHERE level IS NULL;")
    if "rank" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN rank TEXT NOT NULL DEFAULT 'Task Trainee';")
        conn.execute("UPDATE users SET rank = 'Task Trainee' WHERE rank IS NULL;")
    if "goals" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN goals INTEGER NOT NULL DEFAULT 0;")
        conn.execute("UPDATE users SET goals = 0 WHERE goals IS NULL;")
    conn.commit()


def ensure_default_user(conn: TursoConnection) -> None:
    """Ensure a fallback default user exists for legacy data."""
    cursor = conn.execute("SELECT id FROM users WHERE id = 1;")
    row = cursor.fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, login_streak, login_best, tasks_checked_off, check_coins) VALUES (1, 'default', '', 0, 1, 0, 0);"
        )
    conn.commit()

def create_settings_table(conn: TursoConnection) -> None:
    """Create the settings table with a single row if missing."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT NOT NULL,
            view TEXT NOT NULL,
            selected_list_id INTEGER
        );
    """)
    # add missing column if upgraded
    cursor = conn.execute("PRAGMA table_info(settings);")
    cols = [row["name"] for row in cursor.fetchall()]
    if "selected_list_id" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN selected_list_id INTEGER;")
    # Ensure a default row exists
    cursor = conn.execute("SELECT COUNT(*) as count FROM settings;")
    count = cursor.fetchone()["count"]
    if count == 0:
        conn.execute(
            "INSERT INTO settings (id, theme, view, selected_list_id) VALUES (1, ?, ?, ?);",
            ("default", "front", 1)
        )
    conn.commit()

# ADD


def add_todo(conn: TursoConnection, text: str, related_id: Optional[int] = None, list_id: int = 1, deadline: Optional[str] = None) -> int:
    """Insert a new todo and return its auto-generated id."""
    cursor = conn.execute(
        "INSERT INTO todos (text, related_id, list_id, deadline, completed, flags) VALUES (?, ?, ?, ?, 0, 0);",
        (text, related_id, list_id, deadline)
    )
    conn.commit()
    return cursor.lastrowid

# LIST


def list_todos(conn: TursoConnection):
    """Return all todos ordered by id as dictionaries (legacy, unscoped)."""
    cursor = conn.execute(
        "SELECT id, text, related_id, list_id, deadline, completed, flags FROM todos ORDER BY flags DESC, id ASC;"
    )
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def list_todos_for_list(conn: TursoConnection, list_id: int, user_id: int):
    """Return todos for a specific list ordered by id, scoped to user."""
    cursor = conn.execute(
        """
        SELECT t.id, t.text, t.related_id, t.list_id, t.deadline, t.completed, t.flags
        FROM todos t
        JOIN lists l ON l.id = t.list_id
        WHERE t.list_id = ? AND l.user_id = ?
        ORDER BY t.flags DESC, t.id ASC;
        """,
        (list_id, user_id)
    )
    return [dict(row) for row in cursor.fetchall()]


def list_todos_for_user(conn: TursoConnection, user_id: int):
    """Return all todos for a user by joining through lists."""
    cursor = conn.execute(
        """
        SELECT t.id, t.text, t.related_id, t.list_id, t.deadline, t.completed, t.flags
        FROM todos t
        JOIN lists l ON l.id = t.list_id
        WHERE l.user_id = ?
        ORDER BY t.flags DESC, t.id ASC;
        """,
        (user_id,)
    )
    return [dict(row) for row in cursor.fetchall()]


def fetch_todo_for_user(conn: TursoConnection, todo_id: int, user_id: int) -> Optional[dict]:
    """Fetch a todo only if it belongs to the given user via list ownership."""
    cursor = conn.execute(
        """
        SELECT t.id, t.text, t.related_id, t.list_id, t.deadline, t.completed, t.flags
        FROM todos t
        JOIN lists l ON l.id = t.list_id
        WHERE t.id = ? AND l.user_id = ?
        """,
        (todo_id, user_id)
    )
    row = cursor.fetchone()
    return dict(row) if row else None

# EDIT


def update_todo_text(conn: TursoConnection, todo_id: int, new_text: str) -> bool:
    """Update the text field for a todo and report success."""
    cursor = conn.execute(
        "UPDATE todos SET text = ? WHERE id = ?;",
        (new_text, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_related_id(conn: TursoConnection, todo_id: int, new_related_id: Optional[int]) -> bool:
    """Update the related_id of a todo and return whether a row was changed."""
    cursor = conn.execute(
        "UPDATE todos SET related_id = ? WHERE id = ?;",
        (new_related_id, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_deadline(conn: TursoConnection, todo_id: int, deadline: Optional[str]) -> bool:
    """Update deadline for a todo."""
    cursor = conn.execute(
        "UPDATE todos SET deadline = ? WHERE id = ?;",
        (deadline, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_completed(conn: TursoConnection, todo_id: int, completed: bool) -> bool:
    """Update completion flag for a todo."""
    cursor = conn.execute(
        "UPDATE todos SET completed = ? WHERE id = ?;",
        (1 if completed else 0, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_flags(conn: TursoConnection, todo_id: int, flags: int) -> bool:
    """Update the importance flags for a todo."""
    cursor = conn.execute(
        "UPDATE todos SET flags = ? WHERE id = ?;",
        (flags, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0

# DELETE


def delete_todo(conn: TursoConnection, todo_id: int) -> bool:
    """Delete a todo and any rows that reference it by related_id."""
    cursor = conn.execute(
        "DELETE FROM todos WHERE id = ? or related_id = ?;",
        (todo_id, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def print_todos(rows: list[dict]) -> None:
    """Log todos to stdout in a readable format for debugging."""
    if not rows:
        print("No todos yet.")
        return

    print("\nCurrent todos:")
    for row in rows:
        rid = row["related_id"]
        rid_display = "None" if rid is None else str(rid)
        print(f"  #{row['id']}: {row['text']}  (related_id={rid_display})")
    print("")


def fetch_related_todos(db: TursoConnection, related_id: int, list_id: int | None = None):
    """Return todos whose related_id matches the provided id (optionally within a list)."""
    if list_id is not None:
        cursor = db.execute(
            """
            SELECT *
            FROM todos
            WHERE related_id = ? AND list_id = ?
            """,
            (related_id, list_id)
        )
    else:
        cursor = db.execute(
            """
            SELECT *
            FROM todos
            WHERE related_id = ?
            """,
            (related_id,)
        )
    return [dict(row) for row in cursor.fetchall()]


def fetch_a_todo(db: TursoConnection, todo_id: int):
    """Fetch a single todo by id as a dict or return None when missing."""
    cursor = db.execute(
        """
        SELECT t.*
        FROM todos t
        WHERE t.id = ?
        """,
        (todo_id,)
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(row)


def change_related_id(db: TursoConnection, todo_id: int, related_id: int | None):
    """Update the related_id for a todo, allowing it to be cleared."""
    cursor = db.execute(
        """
        UPDATE todos
        SET related_id = ?
        WHERE id = ?
        """,
        (related_id, todo_id)
    )
    db.commit()
    return cursor.rowcount > 0


def fetch_settings(conn: TursoConnection) -> dict:
    """Return the stored theme and view settings, creating defaults if absent."""
    create_settings_table(conn)
    cursor = conn.execute("SELECT theme, view, selected_list_id FROM settings WHERE id = 1;")
    row = cursor.fetchone()
    if row is None:
        return {"theme": "default", "view": "front", "selected_list_id": 1}
    return dict(row)


def update_settings(conn: TursoConnection, theme: str, view: str, selected_list_id: int | None) -> None:
    """Persist theme and view settings as a single-row table."""
    create_settings_table(conn)
    conn.execute(
        """
        INSERT INTO settings (id, theme, view, selected_list_id)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, view = excluded.view, selected_list_id = excluded.selected_list_id;
        """,
        (theme, view, selected_list_id)
    )
    conn.commit()


def list_lists(conn: TursoConnection, user_id: int) -> list[dict]:
    """Return all todo lists for a user."""
    cursor = conn.execute(
        """
        SELECT
          l.id,
          l.name,
          COUNT(t.id) AS task_count
        FROM lists l
        LEFT JOIN todos t ON t.list_id = l.id
        WHERE l.user_id = ?
        GROUP BY l.id, l.name
        ORDER BY l.id ASC;
        """,
        (user_id,)
    )
    return [dict(row) for row in cursor.fetchall()]


def add_list(conn: TursoConnection, name: str, user_id: int) -> int:
    """Create a new list for a user and return its id."""
    cursor = conn.execute("INSERT INTO lists (name, user_id) VALUES (?, ?);", (name, user_id))
    conn.commit()
    return cursor.lastrowid


def update_list_name(conn: TursoConnection, list_id: int, name: str, user_id: int) -> bool:
    """Rename a list if it belongs to the user."""
    cursor = conn.execute("UPDATE lists SET name = ? WHERE id = ? AND user_id = ?;", (name, list_id, user_id))
    conn.commit()
    return cursor.rowcount > 0


def delete_list(conn: TursoConnection, list_id: int, user_id: int) -> bool:
    """Delete a list and its todos for the user."""
    # Remove todos in the list first to avoid orphaned rows when foreign keys are off
    conn.execute("DELETE FROM todos WHERE list_id = ?;", (list_id,))
    cursor = conn.execute("DELETE FROM lists WHERE id = ? AND user_id = ?;", (list_id, user_id))
    conn.commit()
    return cursor.rowcount > 0


def fetch_list(conn: TursoConnection, list_id: int, user_id: int | None = None) -> dict | None:
    if user_id is None:
        cursor = conn.execute("SELECT id, name, user_id FROM lists WHERE id = ?;", (list_id,))
    else:
        cursor = conn.execute("SELECT id, name, user_id FROM lists WHERE id = ? AND user_id = ?;", (list_id, user_id))
    row = cursor.fetchone()
    return dict(row) if row else None


def add_user(conn: TursoConnection, username: str, password_hash: str) -> int:
    """Create a new user and return id."""
    today = datetime.utcnow().date().isoformat()
    cursor = conn.execute(
        """
        INSERT INTO users (
            username,
            password_hash,
            login_streak,
            login_best,
            tasks_checked_off,
            tasks_checked_off_today,
            tasks_checked_off_date,
            last_login,
            check_coins,
            theme,
            view,
            ui_state,
            inventory,
            titles,
            current_title,
            xp,
            level,
            rank,
            goals
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (username, password_hash, 1, 1, 0, 0, today, today, 10, "default", "front", "{}", "[]", "[]", "", 0, 1, "Task Trainee", 0)
    )
    conn.commit()
    return cursor.lastrowid


def fetch_user_by_username(conn: TursoConnection, username: str) -> dict | None:
    """Fetch user record by username."""
    cursor = conn.execute(
        """
        SELECT
            id, username, password_hash,
            login_streak, login_best,
            tasks_checked_off,
            tasks_checked_off_today,
            tasks_checked_off_date,
            last_login,
            check_coins,
            theme,
            view,
            ui_state,
            inventory,
            titles,
            current_title,
            xp,
            level,
            rank,
            goals
        FROM users WHERE username = ?;
        """,
        (username,)
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def fetch_user_by_id(conn: TursoConnection, user_id: int) -> dict | None:
    """Fetch user record by id."""
    cursor = conn.execute(
        """
        SELECT
            id, username, password_hash,
            login_streak, login_best,
            tasks_checked_off,
            tasks_checked_off_today,
            tasks_checked_off_date,
            last_login,
            check_coins,
            theme,
            view,
            ui_state,
            inventory,
            titles,
            current_title,
            xp,
            level,
            rank,
            goals
        FROM users WHERE id = ?;
        """,
        (user_id,)
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def update_user_login_meta(conn: TursoConnection, user_id: int, login_streak: int, login_best: int, last_login: str, check_coins: int) -> bool:
    """Update login streak metadata for a user."""
    cursor = conn.execute(
        "UPDATE users SET login_streak = ?, login_best = ?, last_login = ?, check_coins = ? WHERE id = ?;",
        (login_streak, login_best, last_login, check_coins, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def rank_for_level(level: int) -> str:
    """Map a numeric level to a rank label."""
    if level is None:
        return "Task Trainee"
    if level <= 2:
        return "Task Trainee"
    if level <= 6:
        return "Daily Doer"
    if level <= 10:
        return "Reliable Resolver"
    return "Elite Executor"


def increment_tasks_checked_off(conn: TursoConnection, user_id: int, amount: int = 1):
    """Increment task counters and award XP; returns updated stats dict or False when user missing."""
    cursor = conn.execute(
        """
        SELECT
            tasks_checked_off,
            tasks_checked_off_today,
            tasks_checked_off_date,
            check_coins,
            xp,
            level
        FROM users WHERE id = ?;
        """,
        (user_id,)
    )
    row = cursor.fetchone()
    if row is None:
        return False

    today_str = datetime.utcnow().date().isoformat()
    last_date = row["tasks_checked_off_date"]
    reset_today = last_date != today_str

    base_amount = max(amount, 0)
    new_tasks_checked_off_today = (0 if reset_today else (row["tasks_checked_off_today"] or 0)) + base_amount
    new_tasks_checked_off = (row["tasks_checked_off"] or 0) + base_amount

    # XP logic: each completed task grants 10% toward next level (10 tasks per level).
    current_xp = row["xp"] or 0
    current_level = row["level"] or 1
    gained_xp = base_amount * 10
    total_xp = current_xp + gained_xp
    levels_gained = total_xp // 100
    next_level = current_level + levels_gained
    next_xp = total_xp % 100
    next_rank = rank_for_level(next_level)

    conn.execute(
        """
        UPDATE users
        SET
            tasks_checked_off = ?,
            tasks_checked_off_today = ?,
            tasks_checked_off_date = ?,
            xp = ?,
            level = ?,
            rank = ?
        WHERE id = ?;
        """,
        (new_tasks_checked_off, new_tasks_checked_off_today, today_str, next_xp, next_level, next_rank, user_id)
    )
    conn.commit()
    return {
        "tasks_checked_off": new_tasks_checked_off,
        "tasks_checked_off_today": new_tasks_checked_off_today,
        "tasks_checked_off_date": today_str,
        "check_coins": row["check_coins"] or 0,
        "xp": next_xp,
        "level": next_level,
        "rank": next_rank
    }


def ensure_user_default_list(conn: TursoConnection, user_id: int) -> int:
    """Ensure a default list exists for the given user and return its id."""
    cursor = conn.execute("SELECT id FROM lists WHERE user_id = ? ORDER BY id ASC LIMIT 1;", (user_id,))
    row = cursor.fetchone()
    if row:
        return row["id"]
    cursor = conn.execute(
        "INSERT INTO lists (name, user_id) VALUES (?, ?);",
        ("unnamed list", user_id)
    )
    conn.commit()
    return cursor.lastrowid


def update_user_username(conn: TursoConnection, user_id: int, new_username: str) -> bool:
    """Update username for a given user."""
    cursor = conn.execute(
        "UPDATE users SET username = ? WHERE id = ?;",
        (new_username, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_password(conn: TursoConnection, user_id: int, new_password_hash: str) -> bool:
    """Update password hash for a user."""
    cursor = conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?;",
        (new_password_hash, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_theme_view(conn: TursoConnection, user_id: int, theme: str, view: str) -> bool:
    """Persist a user's last selected theme and view."""
    cursor = conn.execute(
        "UPDATE users SET theme = ?, view = ? WHERE id = ?;",
        (theme, view, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_ui_state(conn: TursoConnection, user_id: int, ui_state: str) -> bool:
    """Persist a user's UI state payload."""
    cursor = conn.execute(
        "UPDATE users SET ui_state = ? WHERE id = ?;",
        (ui_state, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def increment_user_goals(conn: TursoConnection, user_id: int, amount: int = 1) -> int | None:
    """Increment a user's goal count and return the updated total."""
    cursor = conn.execute("SELECT goals FROM users WHERE id = ?;", (user_id,))
    row = cursor.fetchone()
    if row is None:
        return None
    new_goals = (row["goals"] or 0) + max(amount, 0)
    conn.execute("UPDATE users SET goals = ? WHERE id = ?;", (new_goals, user_id))
    conn.commit()
    return new_goals


def update_user_balance_and_inventory(conn: TursoConnection, user_id: int, check_coins: int, inventory_json: str) -> bool:
    """Update a user's coin balance and stored inventory payload."""
    cursor = conn.execute(
        "UPDATE users SET check_coins = ?, inventory = ? WHERE id = ?;",
        (check_coins, inventory_json, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_inventory_and_titles(conn: TursoConnection, user_id: int, inventory_json: str, titles_json: str) -> bool:
    """Update a user's inventory and titles payloads."""
    cursor = conn.execute(
        "UPDATE users SET inventory = ?, titles = ? WHERE id = ?;",
        (inventory_json, titles_json, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_balance_inventory_titles(
    conn: TursoConnection,
    user_id: int,
    check_coins: int,
    inventory_json: str,
    titles_json: str
) -> bool:
    """Update balance plus inventory and titles payloads."""
    cursor = conn.execute(
        "UPDATE users SET check_coins = ?, inventory = ?, titles = ? WHERE id = ?;",
        (check_coins, inventory_json, titles_json, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_user_current_title(conn: TursoConnection, user_id: int, title_key: str) -> bool:
    """Set the currently equipped title for a user."""
    cursor = conn.execute(
        "UPDATE users SET current_title = ? WHERE id = ?;",
        (title_key, user_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def fetch_user_stats(conn: TursoConnection, user_id: int) -> dict | None:
    """Lightweight fetch for frequently returned user fields including XP/level."""
    cursor = conn.execute(
        """
        SELECT
            id, username,
            tasks_checked_off,
            tasks_checked_off_today,
            check_coins,
            xp,
            level,
            theme,
            view,
            ui_state,
            rank,
            inventory,
            titles,
            current_title,
            goals
        FROM users WHERE id = ?;
        """,
        (user_id,)
    )
    row = cursor.fetchone()
    return dict(row) if row else None
