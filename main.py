from fastapi import FastAPI
from ai_task_manager.routers import tasks, users, ai
# app：FastAPI 应用
app = FastAPI()


app.include_router(tasks.router)
app.include_router(users.router)
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
