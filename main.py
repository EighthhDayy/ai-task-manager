from fastapi import FastAPI
from ai_task_manager.routers import tasks, qa, users

# Some checkouts also include the existing documents and agent router.
try:
    import ai_task_manager.routers.ai as ai
except ModuleNotFoundError as exc:
    if exc.name != "ai_task_manager.routers.ai":
        raise
    ai = None

# app：FastAPI 应用
app = FastAPI()


app.include_router(tasks.router)
app.include_router(users.router)
app.include_router(qa.router)
if ai is not None:
    app.include_router(ai.router)

# get， 根路径
@app.get("/")  
def root():
    return {"message": "Hello, World!! This is AI Task Manager API",
            "status":"running",
            "version": "v4"
            }

@app.get("/about")
def about():
    return {
        "project":"AI Task Manager",
        "version":1
    }
