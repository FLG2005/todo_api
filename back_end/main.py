from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from datetime import datetime
from database import (
    connect,
    create_table,
    create_settings_table,
    list_todos,
    list_todos_for_list,
    add_todo,
    delete_todo,
    update_todo_text,
    fetch_related_todos,
    fetch_a_todo,
    change_related_id,
    fetch_settings,
    update_settings,
    list_lists,
    add_list,
    update_list_name,
    delete_list,
    fetch_list,
    update_todo_deadline,
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


class Todo_List(BaseModel):
    todos: list[Todo_item]

class SettingsPayload(BaseModel):
    theme: str
    view: str
    selected_list_id: int | None = None


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


def summarise_with_ai(todo_list):
    print(todo_list)
    client = OpenAI()

    response = client.responses.create(
        model="gpt-4.1",
        input=f'please use my todo list: {todo_list} to plan my day in a friendly and concise manner, do not bother opening up your answer by saying absolutely or so on, just get straight to answering provide a haiku in closing'
    )

    return response.output_text


def reccomend_with_ai(todo):
    client = OpenAI()

    response = client.responses.parse(
        model="gpt-4.1",
        input=f'please use my todo: {todo} to create similar or related tasks that would aid me in completeing other tasks in life without imparing my ability to do said task. give 5 tasks in bullet point form with no other text. do not bother opening up your answer by saying absolutely or so on, the related id is the id of the task which was given.',
        text_format=Todo_List
    )
    return response.output_parsed


@app.get('/todo_list')
def get_todo_list(list_id: int | None = None, db=Depends(get_db)):
    try:
        if list_id is not None:
            if fetch_list(db, list_id) is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"List with id {list_id} not found"
                )
            list_of_todos = list_todos_for_list(db, list_id)
        else:
            list_of_todos = list_todos(db)
        return list_of_todos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch todo list: {str(e)}"
        )


@app.get('/fetch_a_todo/{id}')
def fetch_todo(id: int, db=Depends(get_db)):
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )
    return todo


@app.post('/create_a_todo')
def create_todo(todo_text: str, related_id: int = None, list_id: int = 1, deadline: str | None = None, db=Depends(get_db)):
    if not todo_text or not todo_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )

    # Validate list exists
    if fetch_list(db, list_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )

    # Validate related_id exists if provided
    if related_id is not None:
        related_todo = fetch_a_todo(db, todo_id=related_id)
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
def delete_a_todo(id: int, db=Depends(get_db)):
    # Check if todo exists first
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )

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
def edit_a_todo(id: int, text: str | None = None, deadline: str | None = None, db=Depends(get_db)):
    if text is None and deadline is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update"
        )
    if text is not None and not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )
    clean_deadline = parse_deadline(deadline)

    # Check if todo exists
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )

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
        return {
            "edited": True,
            "message": f"Todo with id {id} updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo: {str(e)}"
        )


@app.post('/summarise_todos')
def summarise(db=Depends(get_db)):
    try:
        list_of_todos = list_todos(db)
        if not list_of_todos:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No todos found to summarize"
            )
        summary = summarise_with_ai(list_of_todos)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to summarize todos: {str(e)}"
        )


@app.post('/reccomended_todos/{id}')
def reccomend(id: int, db=Depends(get_db)):
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )

    try:
        recommendations = reccomend_with_ai(todo)
        return recommendations
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get recommendations: {str(e)}"
        )


@app.get('/lists')
def get_lists(db=Depends(get_db)):
    try:
        return list_lists(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch lists: {str(e)}"
        )


@app.post('/lists')
def create_list(name: str, db=Depends(get_db)):
    if not name or not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="List name cannot be empty"
        )
    try:
        new_id = add_list(db, name.strip())
        return {"id": new_id, "name": name.strip()}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create list: {str(e)}"
        )


@app.put('/lists/{list_id}')
def rename_list(list_id: int, name: str, db=Depends(get_db)):
    if not name or not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="List name cannot be empty"
        )
    if fetch_list(db, list_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )
    try:
        updated = update_list_name(db, list_id, name.strip())
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
def remove_list(list_id: int, db=Depends(get_db)):
    if fetch_list(db, list_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {list_id} not found"
        )
    try:
        deleted = delete_list(db, list_id)
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
def find_related_todos(id: int, db=Depends(get_db)):
    # Check if parent todo exists
    parent_todo = fetch_a_todo(db, todo_id=id)
    if parent_todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parent todo with id {id} not found"
        )

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
def alter_related(id: int, related_id: int = None, db=Depends(get_db)):
    # Check if todo exists
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )

    # If related_id is provided, validate it exists
    if related_id is not None:
        related_todo = fetch_a_todo(db, todo_id=related_id)
        if related_todo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Related todo with id {related_id} not found"
            )
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
def get_settings(db=Depends(get_db)):
    try:
        return fetch_settings(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch settings: {str(e)}"
        )


@app.put('/settings')
def set_settings(payload: SettingsPayload, db=Depends(get_db)):
    allowed_themes = {"default", "cozy", "minimal", "space"}
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
    if payload.selected_list_id is not None and fetch_list(db, payload.selected_list_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List with id {payload.selected_list_id} not found"
        )
    try:
        update_settings(db, payload.theme, payload.view, payload.selected_list_id)
        return {"theme": payload.theme, "view": payload.view, "selected_list_id": payload.selected_list_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save settings: {str(e)}"
        )
