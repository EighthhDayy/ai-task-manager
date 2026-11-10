import os
import jwt

from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from pwdlib import PasswordHash

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from jwt.exceptions import ExpiredSignatureError, InvalidTokenError




from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_task_manager.database import get_db
from ai_task_manager.models import User

load_dotenv()


# 密码 hash 工具
password_hasher = PasswordHash.recommended()


# JWT 配置
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 240


# 用于读取 Authorization: Bearer <token>
# bearer: 持有者、携带者
security = HTTPBearer()


def create_access_token(user_id: int):
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expire
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db:Session = Depends(get_db)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired"
        )

    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )
    try:
        user_id = payload.get("sub")

    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user_id = int(user_id)

    user = db.get(User, user_id)  # 因为 id 是 primary key
    # 或者
    # stmt = select(User).where(User.id == user_id)
    # user = db.scalars(stmt).one_or_none()   

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user     # User ORM object

