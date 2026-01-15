import os
import hashlib
import json
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from openai import OpenAI
from pydantic import BaseModel
from datetime import datetime
from database import (
    connect,
    create_table,
    create_settings_table,
    create_users_table,
    list_todos,
    list_todos_for_list,
    list_todos_for_user,
    add_todo,
    delete_todo,
    update_todo_text,
    fetch_related_todos,
    fetch_a_todo,
    fetch_todo_for_user,
    change_related_id,
    fetch_settings,
    update_settings,
    list_lists,
    add_list,
    update_list_name,
    delete_list,
    fetch_list,
    update_todo_deadline,
    update_todo_completed,
    update_todo_flags,
    add_user,
    fetch_user_by_username,
    fetch_user_by_id,
    ensure_user_default_list,
    update_user_username,
    update_user_password,
    update_user_login_meta,
    increment_tasks_checked_off,
    update_user_theme_view,
    update_user_ui_state,
    increment_user_goals,
    update_user_balance_and_inventory,
    update_user_inventory_and_titles,
    update_user_balance_inventory_titles,
    update_user_current_title,
    fetch_user_stats,
    rank_for_level,
)


def get_db():
    conn = connect()
    try:
        create_table(conn)
        create_settings_table(conn)
        yield conn
    finally:
        conn.close()


todo_list = []


class Todo_item(BaseModel):
    text: str
    related_id: int
    deadline: str | None = None
    flags: int = 0


class Todo_List(BaseModel):
    todos: list[Todo_item]

class SettingsPayload(BaseModel):
    theme: str
    view: str
    selected_list_id: int | None = None
    user_id: int | None = None
    ui_state: dict | None = None


class AuthPayload(BaseModel):
    username: str
    password: str


class UpdateUsernamePayload(BaseModel):
    user_id: int
    new_username: str
    current_password: str


class UpdatePasswordPayload(BaseModel):
    user_id: int
    current_password: str
    new_password: str

class PurchasePayload(BaseModel):
    user_id: int
    item_key: str
    price: int


class GoalPayload(BaseModel):
    user_id: int


class EquipTitlePayload(BaseModel):
    user_id: int
    title_key: str


def normalize_username(username: str) -> str:
    return username.strip()


def parse_ui_state(value: str | None) -> dict:
    if not value:
        return {}
    try:
        data = json.loads(value)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


id_counter = 1

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_env_if_present():
    """Load environment variables from a local .env file without overriding existing values."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_if_present()


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OpenAI API key missing. Set OPENAI_API_KEY or add it to back_end/.env",
        )
    try:
        return OpenAI(api_key=api_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialise OpenAI client: {exc}",
        )

def hash_password(password: str) -> str:
    """Lightweight password hashing for demo purposes."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def parse_inventory(raw_inventory) -> list[str]:
    """Normalize stored inventory payload into a list of item keys."""
    if isinstance(raw_inventory, list):
        return [str(item) for item in raw_inventory if item is not None]
    if isinstance(raw_inventory, str):
        try:
            parsed = json.loads(raw_inventory)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item is not None]
        except Exception:
            return []
    return []


def parse_titles(raw_titles) -> list[str]:
    """Normalize stored titles payload into a list of title keys."""
    if isinstance(raw_titles, list):
        return [str(item) for item in raw_titles if item is not None]
    if isinstance(raw_titles, str):
        try:
            parsed = json.loads(raw_titles)
            if isinstance(parsed, list):
                return [str(item) for item in parsed if item is not None]
        except Exception:
            return []
    return []


TITLE_CATALOG = {
    "rookie": {"label": "Rookie", "unlock_level": 2, "price": 0, "purchasable": False},
    "baller": {"label": "Baller", "unlock_level": 5, "price": 0, "purchasable": False},
    "junior": {"label": "Junior", "price": 20, "purchasable": True},
    "workaholic": {"label": "Workaholic", "price": 50, "purchasable": True},
    "brainiac": {"label": "Brainiac", "price": 100, "purchasable": True},
    "holy-temple": {"label": "Holy Temple", "price": 500, "purchasable": True},
    "collector": {"label": "Collector", "unlock_inventory": 9, "price": 0, "purchasable": False},
}

THEME_LEVEL_UNLOCKS = {
    "football": 10,
}


def title_inventory_key(title_key: str) -> str:
    return f"title:{title_key}"


def ensure_level_titles(db, user_id: int, level: int, titles: list[str] | None = None, inventory: list[str] | None = None):
    """Auto-grant level-based titles and sync inventory."""
    if titles is None or inventory is None:
        user = fetch_user_by_id(db, user_id)
        if not user:
            return [], []
        titles = parse_titles(user.get("titles"))
        inventory = parse_inventory(user.get("inventory"))
    updated = False
    inventory_count = len(inventory)
    for key, meta in TITLE_CATALOG.items():
        unlock_level = meta.get("unlock_level")
        unlock_inventory = meta.get("unlock_inventory")
        meets_level = unlock_level and level >= unlock_level
        meets_inventory = unlock_inventory and inventory_count >= unlock_inventory
        if meets_level or meets_inventory:
            if key not in titles:
                titles.append(key)
                updated = True
            inv_key = title_inventory_key(key)
            if inv_key not in inventory:
                inventory.append(inv_key)
                updated = True
    if updated:
        update_user_inventory_and_titles(db, user_id, json.dumps(inventory), json.dumps(titles))
    return titles, inventory


def ensure_theme_inventory(
    db,
    user: dict,
    inventory: list[str] | None = None,
    titles: list[str] | None = None
):
    """Ensure equipped and level-unlocked themes are present in inventory."""
    if inventory is None:
        inventory = parse_inventory(user.get("inventory"))
    if titles is None:
        titles = parse_titles(user.get("titles"))
    updated_inventory = list(dict.fromkeys(inventory))
    updated = False
    theme = (user.get("theme") or "default").strip()
    if theme and theme != "default" and theme not in updated_inventory:
        updated_inventory.append(theme)
        updated = True
    level = user.get("level") or 1
    for theme_key, unlock_level in THEME_LEVEL_UNLOCKS.items():
        if level >= unlock_level and theme_key not in updated_inventory:
            updated_inventory.append(theme_key)
            updated = True
    if updated:
        update_user_inventory_and_titles(db, user["id"], json.dumps(updated_inventory), json.dumps(titles))
    return updated_inventory, titles

def ensure_user(user_id: int):
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id is required")
    return user_id


def ensure_user_list(db, list_id: int, user_id: int):
    lst = fetch_list(db, list_id, user_id)
    if lst is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"List with id {list_id} not found")
    return lst


def ensure_user_todo(db, todo_id: int, user_id: int):
    todo = fetch_todo_for_user(db, todo_id, user_id)
    if todo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Todo with id {todo_id} not found")
    return todo


def parse_deadline(deadline_str: str | None) -> str | None:
    """Validate and normalize deadline input."""
    if deadline_str is None or deadline_str == "":
        return None
    try:
        # Accept ISO-like strings and store as ISO 8601
        parsed = datetime.fromisoformat(deadline_str)
        return parsed.isoformat()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deadline format. Use ISO format (YYYY-MM-DDTHH:MM[:SS])."
        )


@app.on_event("startup")
def init_db():
    conn = connect()
    try:
        create_table(conn)
        create_settings_table(conn)
    finally:
        conn.close()


def normalize_username(username: str) -> str:
    return username.strip()


@app.post("/auth/signup")
def signup(payload: AuthPayload, db=Depends(get_db)):
    username = normalize_username(payload.username)
    password = payload.password.strip()
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")
    existing = fetch_user_by_username(db, username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    try:
        user_id = add_user(db, username, hash_password(password))
        ensure_user_default_list(db, user_id)
        return {
            "id": user_id,
            "username": username,
            "login_streak": 1,
            "login_best": 1,
            "tasks_checked_off": 0,
            "check_coins": 10,
            "theme": "default",
            "view": "front",
            "ui_state": {},
            "inventory": [],
            "titles": [],
            "current_title": "",
            "xp": 0,
            "level": 1,
            "rank": "Task Trainee",
            "goals": 0
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {exc}"
        )


@app.post("/auth/login")
def login(payload: AuthPayload, db=Depends(get_db)):
    username = normalize_username(payload.username)
    password = payload.password.strip()
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")
    user = fetch_user_by_username(db, username)
    if not user or user.get("password_hash") != hash_password(password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid login credentials. Try entering them again."
        )
    # Update login streak and check coins
    today = datetime.utcnow().date()
    existing_streak = user.get("login_streak") or 0
    existing_coins = user.get("check_coins") or 0
    best_streak = user.get("login_best") or 1
    tasks_checked_off = user.get("tasks_checked_off") or 0
    tasks_checked_off_today = user.get("tasks_checked_off_today") or 0
    tasks_checked_off_date = user.get("tasks_checked_off_date")
    inventory = parse_inventory(user.get("inventory"))
    titles = parse_titles(user.get("titles"))
    current_title = user.get("current_title") or ""
    last_login_str = user.get("last_login")
    new_streak = 1
    coins_earned = 0
    streak_increment = 0

    def coins_for_increment(prev_streak: int, next_streak: int) -> int:
        """Reward 10 coins per streak day gained plus milestone bonuses."""
        if next_streak <= prev_streak:
            return 0
        earned = (next_streak - prev_streak) * 10
        thresholds = (
            (5, 20),
            (10, 50),
            (20, 100),
            (50, 300),
        )
        for threshold, bonus in thresholds:
            if next_streak >= threshold and prev_streak < threshold:
                earned += bonus
        return earned

    if last_login_str:
        try:
            last_login_date = datetime.fromisoformat(last_login_str).date()
        except Exception:
            last_login_date = None
        if last_login_date:
            delta_days = max((today - last_login_date).days, 0)
            if delta_days == 0:
                new_streak = max(existing_streak, 1)
                coins_earned = 0
            elif delta_days == 1:
                new_streak = (existing_streak or 0) + 1
                coins_earned = coins_for_increment(existing_streak, new_streak)
            else:
                # Missed at least one full day: reset the streak to 1 for today and award the daily login coins.
                new_streak = 1
                coins_earned = 10
        else:
            # Unparseable last_login: treat as a fresh login day.
            new_streak = 1
            coins_earned = 10
    else:
        # First recorded login: grant daily coins.
        new_streak = max(existing_streak, 1)
        coins_earned = 10 if existing_streak == 0 else 0

    # Reset daily tasks if the date rolled over
    if tasks_checked_off_date != today.isoformat():
        tasks_checked_off_today = 0
        db.execute(
            "UPDATE users SET tasks_checked_off_today = 0, tasks_checked_off_date = ? WHERE id = ?;",
            (today.isoformat(), user["id"])
        )
        db.commit()

    new_total_coins = existing_coins + coins_earned
    new_best = max(best_streak, new_streak, 1)
    update_user_login_meta(db, user["id"], new_streak, new_best, today.isoformat(), new_total_coins)
    titles, inventory = ensure_level_titles(db, user["id"], user.get("level") or 1, titles, inventory)
    inventory, titles = ensure_theme_inventory(db, user, inventory, titles)
    return {
        "id": user["id"],
        "username": user["username"],
        "login_streak": new_streak,
        "login_best": new_best,
        "tasks_checked_off": tasks_checked_off,
        "tasks_checked_off_today": tasks_checked_off_today,
        "check_coins": new_total_coins,
        "theme": user.get("theme") or "default",
        "view": user.get("view") or "front",
        "ui_state": parse_ui_state(user.get("ui_state")),
        "inventory": inventory,
        "titles": titles,
        "current_title": current_title,
        "xp": user.get("xp") or 0,
        "level": user.get("level") or 1,
        "rank": rank_for_level(user.get("level") or 1),
        "goals": user.get("goals") or 0
    }


@app.post("/auth/update_username")
def update_username(payload: UpdateUsernamePayload, db=Depends(get_db)):
    user = fetch_user_by_id(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.get("password_hash") != hash_password(payload.current_password.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    new_username = normalize_username(payload.new_username)
    if not new_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New username is required")
    existing = fetch_user_by_username(db, new_username)
    if existing and existing.get("id") != payload.user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    updated = update_user_username(db, payload.user_id, new_username)
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update username")
    return {"id": payload.user_id, "username": new_username}


@app.post("/auth/update_password")
def update_password(payload: UpdatePasswordPayload, db=Depends(get_db)):
    user = fetch_user_by_id(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.get("password_hash") != hash_password(payload.current_password.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    new_pw = payload.new_password.strip()
    if not new_pw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password is required")
    updated = update_user_password(db, payload.user_id, hash_password(new_pw))
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update password")
    return {"id": payload.user_id, "username": user["username"]}


@app.post("/store/purchase")
def purchase_item(payload: PurchasePayload, db=Depends(get_db)):
    user = fetch_user_by_id(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    item_key = (payload.item_key or "").strip()
    if not item_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item key")
    current_coins = user.get("check_coins") or 0

    inventory = parse_inventory(user.get("inventory"))
    titles = parse_titles(user.get("titles"))

    if item_key.startswith("title:"):
        title_key = item_key.split(":", 1)[1]
        title_meta = TITLE_CATALOG.get(title_key)
        if not title_meta or not title_meta.get("purchasable"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid title")
        if title_key in titles:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title already owned")
        price = int(title_meta.get("price") or 0)
        if price <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid price")
        if current_coins < price:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough check coins")
        new_balance = current_coins - price
        titles.append(title_key)
        inv_key = title_inventory_key(title_key)
        if inv_key not in inventory:
            inventory.append(inv_key)
        updated = update_user_balance_inventory_titles(
            db, user["id"], new_balance, json.dumps(inventory), json.dumps(titles)
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update balance")
        titles, inventory = ensure_level_titles(db, user["id"], user.get("level") or 1, titles, inventory)
        inventory, titles = ensure_theme_inventory(db, user, inventory, titles)
        return {
            "user_id": user["id"],
            "check_coins": new_balance,
            "inventory": inventory,
            "titles": titles
        }

    price = max(int(payload.price), 0)
    if price <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid price")
    if current_coins < price:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough check coins")

    new_balance = current_coins - price
    updated_inventory = list(dict.fromkeys([*inventory, item_key]))
    inventory_json = json.dumps(updated_inventory)

    updated = update_user_balance_and_inventory(db, user["id"], new_balance, inventory_json)
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update balance")

    titles, updated_inventory = ensure_level_titles(db, user["id"], user.get("level") or 1, titles, updated_inventory)
    updated_inventory, titles = ensure_theme_inventory(db, user, updated_inventory, titles)
    return {
        "user_id": user["id"],
        "check_coins": new_balance,
        "inventory": updated_inventory,
        "titles": titles
    }


@app.post("/titles/equip")
def equip_title(payload: EquipTitlePayload, db=Depends(get_db)):
    user = fetch_user_by_id(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    title_key = (payload.title_key or "").strip()
    titles = parse_titles(user.get("titles"))
    inventory = parse_inventory(user.get("inventory"))
    titles, inventory = ensure_level_titles(db, user["id"], user.get("level") or 1, titles, inventory)
    if title_key and title_key not in titles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title not owned")
    updated = update_user_current_title(db, user["id"], title_key)
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to equip title")
    return {"user_id": user["id"], "current_title": title_key}


def summarise_with_ai(todo_list):
    print(todo_list)
    client = get_openai_client()

    response = client.responses.create(
        model="gpt-4.1",
    input=(
        "please use my todo list: "
        f"{todo_list} to plan my day in a friendly and concise manner, "
        "do not bother opening up your answer by saying absolutely or so on, "
        "just get straight to answering provide a haiku in closing"
    )
    )

    return response.output_text


def reccomend_with_ai(todo):
    """Generate related todos using OpenAI and return a simple list of dicts."""
    client = get_openai_client()

    prompt = (
        "You are helping expand a todo item into adjacent, helpful follow-up tasks. "
        "Return 5 concise task suggestions as bullet lines. "
        "Do NOT add extra wording before or after the bullets. "
        "Example format:\n"
        "- Pack sunscreen\n"
        "- Check tire pressure\n"
        "- Confirm campsite booking\n"
        "- Prep quick snacks\n"
        "- Lay out hiking clothes\n\n"
        f"Original todo: {todo}"
    )

    try:
        response = client.responses.create(model="gpt-4.1", input=prompt)
        raw_text = response.output_text
    except Exception as exc:  # pragma: no cover - safety net for upstream errors
        print(f"OpenAI recommendation error: {exc}")
        raw_text = ""

    def parse_recommendations(text: str) -> list[dict]:
        if not text:
            return []
        lines = [ln.strip(" \n\r\t-*•") for ln in text.splitlines() if ln.strip()]
        cleaned = [ln for ln in lines if ln]
        return [{"text": item, "related_id": todo.get("id")} for item in cleaned][:5]

    parsed = parse_recommendations(raw_text)
    if not parsed:
        parsed = [
            {"text": f"Break {todo.get('text', 'this task')} into smaller steps", "related_id": todo.get("id")},
            {"text": "Prepare any materials or info needed", "related_id": todo.get("id")},
            {"text": "Set a time to start and a time to finish", "related_id": todo.get("id")},
        ]
    return {"todos": parsed}


@app.get('/todo_list')
def get_todo_list(list_id: int | None = None, user_id: int | None = None, db=Depends(get_db)):
    ensure_user(user_id)
    try:
        if list_id is not None:
            ensure_user_list(db, list_id, user_id)
            list_of_todos = list_todos_for_list(db, list_id, user_id)
        else:
            list_of_todos = list_todos_for_user(db, user_id)
        return list_of_todos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch todo list: {str(e)}"
        )


@app.get('/fetch_a_todo/{id}')
def fetch_todo(id: int, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    todo = ensure_user_todo(db, id, user_id)
    return todo


@app.post('/create_a_todo')
def create_todo(
    todo_text: str,
    related_id: int = None,
    list_id: int = 1,
    deadline: str | None = None,
    user_id: int | None = None,
    db=Depends(get_db)
):
    ensure_user(user_id)
    if not todo_text or not todo_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )

    # Validate list exists
    if fetch_list(db, list_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )

    # Validate related_id exists if provided and belongs to same user
    if related_id is not None:
        related_todo = ensure_user_todo(db, related_id, user_id)
        if related_todo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Related todo with id {related_id} not found"
            )
        if related_todo.get("list_id") != list_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Related todo must be in the same list"
            )

    clean_deadline = parse_deadline(deadline)
    try:
        new_todo_id = add_todo(db, todo_text, related_id, list_id, clean_deadline)
        return {
            'success': f'created todo with id: {new_todo_id}',
            'id': new_todo_id
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create todo: {str(e)}"
        )


@app.delete('/delete_a_todo/{id}')
def delete_a_todo(id: int, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    ensure_user_todo(db, id, user_id)

    try:
        todo_deleted = delete_todo(db, id)
        if not todo_deleted:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete todo"
            )
        return {
            "deleted": True,
            "message": f"Todo with id {id} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete todo: {str(e)}"
        )


@app.put('/edit_a_todo')
def edit_a_todo(
    id: int,
    text: str | None = None,
    deadline: str | None = None,
    completed: bool | None = None,
    flags: int | None = None,
    user_id: int | None = None,
    db=Depends(get_db)
):
    ensure_user(user_id)
    if text is None and deadline is None and completed is None and flags is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update"
        )
    if text is not None and not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )
    if flags is not None and (flags < 0 or flags > 3):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Flags must be between 0 and 3"
        )
    clean_deadline = parse_deadline(deadline)

    # Check if todo exists for user
    existing_todo = ensure_user_todo(db, id, user_id)
    previous_completed = bool(existing_todo.get("completed"))
    updated_user_stats = None

    try:
        if text is not None:
            edit_success = update_todo_text(db, id, text)
            if not edit_success:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update todo"
                )
        if deadline is not None:
            deadline_success = update_todo_deadline(db, id, clean_deadline)
            if not deadline_success:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update deadline"
                )
        if completed is not None:
            if previous_completed and completed is False:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Completed tasks cannot be unchecked"
                )
            should_increment_task_counter = (completed is True) and (previous_completed is False)
            completed_success = update_todo_completed(db, id, completed)
            if not completed_success:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update completion"
                )
            if should_increment_task_counter:
                updated_user_stats = increment_tasks_checked_off(db, user_id, 1)
        if flags is not None:
            flags_success = update_todo_flags(db, id, flags)
            if not flags_success:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update flags"
                )
        response_body = {
            "edited": True,
            "message": f"Todo with id {id} updated successfully"
        }
        if updated_user_stats:
            user = fetch_user_by_id(db, user_id)
            titles, inventory = ensure_level_titles(db, user_id, updated_user_stats.get("level") or 1)
            if user:
                inventory, titles = ensure_theme_inventory(db, user, inventory, titles)
            # Return updated counters so the client can sync XP/level without an extra fetch.
            updated_user_stats["titles"] = titles
            updated_user_stats["inventory"] = inventory
            response_body["user"] = updated_user_stats
        return response_body
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo: {str(e)}"
        )


@app.post('/summarise_todos')
def summarise(list_id: int | None = None, user_id: int | None = None, db=Depends(get_db)):
    ensure_user(user_id)
    try:
        if list_id is not None:
            ensure_user_list(db, list_id, user_id)
            list_of_todos = list_todos_for_list(db, list_id, user_id)
        else:
            list_of_todos = list_todos_for_user(db, user_id)
        if not list_of_todos:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No todos found to summarize"
            )
        summary = summarise_with_ai(list_of_todos)
        return PlainTextResponse(content=summary)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to summarize todos: {str(e)}"
        )


@app.post('/reccomended_todos/{id}')
def reccomend(id: int, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    todo = ensure_user_todo(db, id, user_id)

    try:
        recommendations = reccomend_with_ai(todo)
        return recommendations
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recommendations: {str(e)}"
        )


@app.get('/lists')
def get_lists(user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    try:
        return list_lists(db, user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch lists: {str(e)}"
        )


@app.post('/lists')
def create_list(name: str, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    if not name or not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="List name cannot be empty"
        )
    try:
        new_id = add_list(db, name.strip(), user_id)
        return {"id": new_id, "name": name.strip()}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create list: {str(e)}"
        )


@app.put('/lists/{list_id}')
def rename_list(list_id: int, name: str, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    if not name or not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="List name cannot be empty"
        )
    if fetch_list(db, list_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )
    try:
        updated = update_list_name(db, list_id, name.strip(), user_id)
        if not updated:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rename list")
        return {"id": list_id, "name": name.strip()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rename list: {str(e)}"
        )


@app.delete('/lists/{list_id}')
def remove_list(list_id: int, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    if fetch_list(db, list_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )
    try:
        deleted = delete_list(db, list_id, user_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete list")
        current_settings = fetch_settings(db)
        if current_settings.get("selected_list_id") == list_id:
            update_settings(db, current_settings["theme"], current_settings["view"], 1)
        return {"deleted": True, "id": list_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete list: {str(e)}"
        )


@app.get('/fetch_related_todos/{id}')
def find_related_todos(id: int, user_id: int, db=Depends(get_db)):
    ensure_user(user_id)
    # Check if parent todo exists for user
    parent_todo = ensure_user_todo(db, id, user_id)

    try:
        fetched_related = fetch_related_todos(db, related_id=id, list_id=parent_todo.get("list_id"))
        return {
            "related": fetched_related
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch related todos: {str(e)}"
        )


@app.put('/alter_related_todos')
def alter_related(id: int, related_id: int = None, user_id: int | None = None, db=Depends(get_db)):
    ensure_user(user_id)
    # Check if todo exists for user
    todo = ensure_user_todo(db, id, user_id)

    # If related_id is provided, validate it exists
    if related_id is not None:
        related_todo = ensure_user_todo(db, related_id, user_id)
        if related_todo.get("list_id") != todo.get("list_id"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Related todo must be in the same list"
            )

    try:
        change_success = change_related_id(
            db, todo_id=id, related_id=related_id)
        if not change_success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update related_id"
            )
        return {
            "success": True,
            "message": f"Todo {id} related_id updated to {related_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update related_id: {str(e)}"
        )


@app.get('/settings')
def get_settings(user_id: int | None = None, db=Depends(get_db)):
    try:
        base_settings = fetch_settings(db)
        if user_id is not None:
            user = fetch_user_by_id(db, user_id)
            if user is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with id {user_id} not found")
            theme = user.get("theme") or base_settings.get("theme") or "default"
            view = user.get("view") or base_settings.get("view") or "front"
            ui_state = parse_ui_state(user.get("ui_state"))
            return {
                "theme": theme,
                "view": view,
                "ui_state": ui_state,
                "selected_list_id": base_settings.get("selected_list_id")
            }
        return base_settings
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch settings: {str(e)}"
        )


@app.put('/settings')
def set_settings(payload: SettingsPayload, db=Depends(get_db)):
    allowed_themes = {"default", "cozy", "minimal", "space", "royalGarden", "beachDay", "football"}
    allowed_views = {"front", "lists", "detail"}
    if payload.theme not in allowed_themes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid theme"
        )
    if payload.view not in allowed_views:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid view"
        )
    if payload.selected_list_id is not None:
        owner_id = payload.user_id if payload.user_id is not None else None
        if fetch_list(db, payload.selected_list_id, owner_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"List with id {payload.selected_list_id} not found"
            )
    user = None
    if payload.user_id is not None:
        user = fetch_user_by_id(db, payload.user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with id {payload.user_id} not found"
            )
    try:
        update_settings(db, payload.theme, payload.view, payload.selected_list_id)
        if payload.user_id is not None:
            update_user_theme_view(db, payload.user_id, payload.theme, payload.view)
            if payload.ui_state is not None:
                ui_state_json = json.dumps(payload.ui_state)
                update_user_ui_state(db, payload.user_id, ui_state_json)
            if user:
                user_with_theme = {**user, "theme": payload.theme}
                inventory = parse_inventory(user.get("inventory"))
                titles = parse_titles(user.get("titles"))
                ensure_theme_inventory(db, user_with_theme, inventory, titles)
        return {"theme": payload.theme, "view": payload.view, "selected_list_id": payload.selected_list_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save settings: {str(e)}"
        )


@app.post("/goals/score")
def score_goal(payload: GoalPayload, db=Depends(get_db)):
    if fetch_user_by_id(db, payload.user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {payload.user_id} not found"
        )
    updated = increment_user_goals(db, payload.user_id, 1)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update goals"
        )
    return {"goals": updated}
