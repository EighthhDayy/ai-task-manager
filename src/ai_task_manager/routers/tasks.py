from fastapi import APIRouter, Depends, HTTPException


from ai_task_manager.schemas import TaskCreate, TaskUpdate, TaskResponse
from ai_task_manager.auth import get_current_user


from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_task_manager.database import get_db
from ai_task_manager.models import Task, User


router = APIRouter(tags=["Tasks"])

# CRUD——读取
@router.get("/my/tasks", status_code=200, response_model=list[TaskResponse])        # response_model=TaskResponse 返回的不是列表
# 去调用 get_current_user，把它的返回值放进 current_user
 # db 这个参数的类型是 Session，FastAPI 去调用 get_db，把得到的数据库 session 放进 db
def get_my_tasks(
    current_user: User = Depends(get_current_user),  
    db: Session = Depends(get_db)
    ):
    user_id = current_user.id

    stmt = (
        select (Task).where(Task.user_id == user_id).order_by(Task.id)
    )
    tasks = db.scalars(stmt).all()  # tasks是一组 Task 对象。查询出来的每一条结果都会被 SQLAlchemy ORM 变成一个 Task 类的对象
    return tasks   # .all()返回的是list[Task]

# CRUD——新增
@router.post("/my/tasks", status_code=201, response_model=TaskResponse)
def add_new_task(
    new_task: TaskCreate,
    current_user: User = Depends(get_current_user),
    db:Session = Depends(get_db)
):
    user_id = current_user.id

    task = Task(
        title = new_task.title,
        completed = new_task.completed,
        description=new_task.description,
        user_id = user_id
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return task
    

# CRUD——更新
@router.patch("/my/tasks/{task_id}", status_code=200, response_model=TaskResponse)
def update_task(
    update: TaskUpdate,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user.id
    # 先把旧task找出来
    # 该task必须是该用户的
    stmt = select(Task).where(
        Task.id == task_id,
        Task.user_id == user_id
    )

    task = db.scalars(stmt).one_or_none()

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    if update.title is not None:
        task.title = update.title
    

    if update.completed is not None:
        task.completed = update.completed

    if "description" in update.model_fields_set:  # 区分没传和明确传null
        task.description = update.description

    db.commit()
    db.refresh(task)

    return task

# CRUD——删除
@router.delete("/my/tasks/{task_id}")
def remove_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db:Session = Depends(get_db)
):
    user_id = current_user.id
    # 先找出要删除那个task，它必须是本用户的task
    stmt = select(Task).where(Task.id == task_id, Task.user_id == user_id)
    deleted_task = db.scalars(stmt).one_or_none()

    if deleted_task is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    db.delete(deleted_task)
    db.commit()

    return {"message": "Task deleted"}


