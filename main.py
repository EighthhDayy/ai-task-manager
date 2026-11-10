from fastapi import FastAPI
from ai_task_manager.routers import tasks, users, ai, qa
# 创建一个对象，叫app, 创建 FastAPI 应用
app = FastAPI()

# 安装 routers
# 把 tasks.py 里面那个 router 收集的所有 route，安装到这个 FastAPI app 上

app.include_router(tasks.router)
app.include_router(users.router)
app.include_router(ai.router)
app.include_router(qa.router)

# get
@app.get("/")  # 根路径
def root():
    return {"message": "Hello, World!! AI Task Manager API",
            "status":"running",
            "version": "v4"
            }

@app.get("/about")
def about():
    return {
        "project":"AI Task Manager",
        "version":1
    }
