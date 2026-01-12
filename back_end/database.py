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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            related_id INTEGER
        );
    """)
    conn.commit()

def create_settings_table(conn: sqlite3.Connection) -> None:
    """Create the settings table with a single row if missing."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT NOT NULL,
            view TEXT NOT NULL
        );
    """)
    # Ensure a default row exists
    cursor = conn.execute("SELECT COUNT(*) as count FROM settings;")
    count = cursor.fetchone()["count"]
    if count == 0:
        conn.execute(
            "INSERT INTO settings (id, theme, view) VALUES (1, ?, ?);",
            ("default", "front")
        )
    conn.commit()

# ADD


def add_todo(conn: sqlite3.Connection, text: str, related_id: Optional[int] = None) -> int:
    """Insert a new todo and return its auto-generated id."""
    cursor = conn.execute(
        "INSERT INTO todos (text, related_id) VALUES (?, ?);",
        (text, related_id)
    )
    conn.commit()
    return cursor.lastrowid

# LIST


def list_todos(conn: sqlite3.Connection):
    """Return all todos ordered by id as dictionaries."""
    cursor = conn.execute(
        "SELECT id, text, related_id FROM todos ORDER BY id ASC;"
    )
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

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


def fetch_related_todos(db, related_id: int):
    """Return todos whose related_id matches the provided id."""
    cursor = db.cursor()
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
    cursor = conn.execute("SELECT theme, view FROM settings WHERE id = 1;")
    row = cursor.fetchone()
    if row is None:
        return {"theme": "default", "view": "front"}
    return dict(row)


def update_settings(conn: sqlite3.Connection, theme: str, view: str) -> None:
    """Persist theme and view settings as a single-row table."""
    create_settings_table(conn)
    conn.execute(
        """
        INSERT INTO settings (id, theme, view)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, view = excluded.view;
        """,
        (theme, view)
    )
    conn.commit()
