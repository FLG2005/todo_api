from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from database import connect, create_table, create_settings_table, list_todos, add_todo, delete_todo, update_todo_text, fetch_related_todos, fetch_a_todo, change_related_id, fetch_settings, update_settings


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


class Todo_List(BaseModel):
    todos: list[Todo_item]

class SettingsPayload(BaseModel):
    theme: str
    view: str


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
def get_todo_list(db=Depends(get_db)):
    try:
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
def create_todo(todo_text: str, related_id: int = None, db=Depends(get_db)):
    if not todo_text or not todo_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )

    # Validate related_id exists if provided
    if related_id is not None:
        related_todo = fetch_a_todo(db, todo_id=related_id)
        if related_todo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Related todo with id {related_id} not found"
            )

    try:
        new_todo_id = add_todo(db, todo_text, related_id)
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
def edit_a_todo(id: int, text: str, db=Depends(get_db)):
    if not text or not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todo text cannot be empty"
        )

    # Check if todo exists
    todo = fetch_a_todo(db, todo_id=id)
    if todo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Todo with id {id} not found"
        )

    try:
        edit_success = update_todo_text(db, id, text)
        if not edit_success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update todo"
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
        fetched_related = fetch_related_todos(db, related_id=id)
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
    try:
        update_settings(db, payload.theme, payload.view)
        return {"theme": payload.theme, "view": payload.view}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save settings: {str(e)}"
        )
