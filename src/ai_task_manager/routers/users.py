from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from ai_task_manager.schemas import UserCreate, LoginRequest, UserResponse
from ai_task_manager.auth import (
    password_hasher,
    create_access_token,
    get_current_user,
)

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ai_task_manager.database import get_db
from ai_task_manager.models import User

from sqlalchemy import select


router = APIRouter(
    tags=["Users"]
)


# 注册
@router.post("/users", status_code=201)
def add_new_user(user: UserCreate, db:Session = Depends(get_db)):
    hashed_password = password_hasher.hash(user.password)

    new_user = User(
        username = user.username,
        email = user.email,
        password_hash = hashed_password
    )
    db.add(new_user)
    try:
        db.commit()
    
    # 用户名或邮箱已存在
    except IntegrityError:  # 数据库完整性约束被违反了
        db.rollback()   # 撤回去：刚才这一笔操作不要了，把 transaction （事务）恢复到可用状态
        raise HTTPException(
            status_code=409,
            detail="Username or email already exists"
        )
    db.refresh(new_user)

    return new_user


# 登录
@router.post("/login")
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    # 先查找用户
    stmt = select(User).where(User.username == login_data.username)  
    user = db.scalars(stmt).one_or_none()

    # 用户不存在
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    # 旧测试用户可能没有 password_hash
    if user.password_hash is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    is_correct = password_hasher.verify(
        login_data.password,
        user.password_hash
    )

    if not is_correct:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    access_token = create_access_token(user.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "message": "Login successful"
    }


# 查看当前登录用户
@router.get("/me", response_model=UserResponse)   # 这个接口虽然内部可以返回一个完整的 User ORM 对象，但 FastAPI 最后发给客户端时，要按照 UserResponse 这个 Pydantic 模型来整理和过滤数据
def get_me(
    current_user: User = Depends(get_current_user)
):
    return current_user