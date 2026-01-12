import sqlite3
from typing import Optional

DB_FILE = "todo.db"


def connect() -> sqlite3.Connection:
    """Create a SQLite connection to todo.db with safe defaults enabled."""
    # This creates todo.db in the same folder if it doesn't exist yet.
    conn = sqlite3.connect(DB_FILE)

    # Makes rows behave like dictionaries (row["text"]) instead of tuples (row[1]).
    conn.row_factory = sqlite3.Row

    # Good practice: enforce foreign keys if you ever add them later.
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def create_table(conn: sqlite3.Connection) -> None:
    """Create the todos table if it does not already exist."""
    create_lists_table(conn)
    create_settings_table(conn)
    create_todos_table(conn)


def create_lists_table(conn: sqlite3.Connection) -> None:
    """Create the lists table and ensure a default list row."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        );
    """)
    # Ensure a default list exists
    cursor = conn.execute("SELECT COUNT(*) as count FROM lists;")
    count = cursor.fetchone()["count"]
    if count == 0:
        conn.execute("INSERT INTO lists (id, name) VALUES (1, 'Default List');")
    conn.commit()


def create_todos_table(conn: sqlite3.Connection) -> None:
    """Create todos table with list_id support or migrate existing schema."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            related_id INTEGER,
            list_id INTEGER NOT NULL DEFAULT 1,
            deadline TEXT,
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
    conn.commit()

def create_settings_table(conn: sqlite3.Connection) -> None:
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


def add_todo(conn: sqlite3.Connection, text: str, related_id: Optional[int] = None, list_id: int = 1, deadline: Optional[str] = None) -> int:
    """Insert a new todo and return its auto-generated id."""
    cursor = conn.execute(
        "INSERT INTO todos (text, related_id, list_id, deadline) VALUES (?, ?, ?, ?);",
        (text, related_id, list_id, deadline)
    )
    conn.commit()
    return cursor.lastrowid

# LIST


def list_todos(conn: sqlite3.Connection):
    """Return all todos ordered by id as dictionaries."""
    cursor = conn.execute(
        "SELECT id, text, related_id, list_id, deadline FROM todos ORDER BY id ASC;"
    )
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def list_todos_for_list(conn: sqlite3.Connection, list_id: int):
    """Return todos for a specific list ordered by id."""
    cursor = conn.execute(
        "SELECT id, text, related_id, list_id, deadline FROM todos WHERE list_id = ? ORDER BY id ASC;",
        (list_id,)
    )
    return [dict(row) for row in cursor.fetchall()]

# EDIT


def update_todo_text(conn: sqlite3.Connection, todo_id: int, new_text: str) -> bool:
    """Update the text field for a todo and report success."""
    cursor = conn.execute(
        "UPDATE todos SET text = ? WHERE id = ?;",
        (new_text, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_related_id(conn: sqlite3.Connection, todo_id: int, new_related_id: Optional[int]) -> bool:
    """Update the related_id of a todo and return whether a row was changed."""
    cursor = conn.execute(
        "UPDATE todos SET related_id = ? WHERE id = ?;",
        (new_related_id, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def update_todo_deadline(conn: sqlite3.Connection, todo_id: int, deadline: Optional[str]) -> bool:
    """Update deadline for a todo."""
    cursor = conn.execute(
        "UPDATE todos SET deadline = ? WHERE id = ?;",
        (deadline, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0

# DELETE


def delete_todo(conn: sqlite3.Connection, todo_id: int) -> bool:
    """Delete a todo and any rows that reference it by related_id."""
    cursor = conn.execute(
        "DELETE FROM todos WHERE id = ? or related_id = ?;",
        (todo_id, todo_id)
    )
    conn.commit()
    return cursor.rowcount > 0


def print_todos(rows: list[sqlite3.Row]) -> None:
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


def fetch_related_todos(db, related_id: int, list_id: int | None = None):
    """Return todos whose related_id matches the provided id (optionally within a list)."""
    cursor = db.cursor()
    if list_id is not None:
        cursor.execute(
            """
            SELECT *
            FROM todos
            WHERE related_id = ? AND list_id = ?
            """,
            (related_id, list_id)
        )
    else:
        cursor.execute(
            """
            SELECT *
            FROM todos
            WHERE related_id = ?
            """,
            (related_id,)
        )
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def fetch_a_todo(db, todo_id: int):
    """Fetch a single todo by id as a dict or return None when missing."""
    cursor = db.cursor()
    cursor.execute(
        """
        SELECT *
        FROM todos
        WHERE id = ?
        """,
        (todo_id,)
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(row)


def change_related_id(db, todo_id: int, related_id: int | None):
    """Update the related_id for a todo, allowing it to be cleared."""
    cursor = db.cursor()
    cursor.execute(
        """
        UPDATE todos
        SET related_id = ?
        WHERE id = ?
        """,
        (related_id, todo_id)
    )
    db.commit()
    return cursor.rowcount > 0


def fetch_settings(conn: sqlite3.Connection) -> dict:
    """Return the stored theme and view settings, creating defaults if absent."""
    create_settings_table(conn)
    cursor = conn.execute("SELECT theme, view, selected_list_id FROM settings WHERE id = 1;")
    row = cursor.fetchone()
    if row is None:
        return {"theme": "default", "view": "front", "selected_list_id": 1}
    return dict(row)


def update_settings(conn: sqlite3.Connection, theme: str, view: str, selected_list_id: int | None) -> None:
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


def list_lists(conn: sqlite3.Connection) -> list[dict]:
    """Return all todo lists."""
    cursor = conn.execute("SELECT id, name FROM lists ORDER BY id ASC;")
    return [dict(row) for row in cursor.fetchall()]


def add_list(conn: sqlite3.Connection, name: str) -> int:
    """Create a new list and return its id."""
    cursor = conn.execute("INSERT INTO lists (name) VALUES (?);", (name,))
    conn.commit()
    return cursor.lastrowid


def update_list_name(conn: sqlite3.Connection, list_id: int, name: str) -> bool:
    """Rename a list."""
    cursor = conn.execute("UPDATE lists SET name = ? WHERE id = ?;", (name, list_id))
    conn.commit()
    return cursor.rowcount > 0


def delete_list(conn: sqlite3.Connection, list_id: int) -> bool:
    """Delete a list and its todos."""
    # Remove todos in the list first to avoid orphaned rows when foreign keys are off
    conn.execute("DELETE FROM todos WHERE list_id = ?;", (list_id,))
    cursor = conn.execute("DELETE FROM lists WHERE id = ?;", (list_id,))
    conn.commit()
    return cursor.rowcount > 0


def fetch_list(conn: sqlite3.Connection, list_id: int) -> dict | None:
    cursor = conn.execute("SELECT id, name FROM lists WHERE id = ?;", (list_id,))
    row = cursor.fetchone()
    return dict(row) if row else None
