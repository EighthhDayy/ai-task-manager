# pytest 的测试配置文件

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, URL
from sqlalchemy.orm import Session

from main import app
from ai_task_manager.database import get_db
from ai_task_manager.models import Base

from tests.helpers import register_and_login

TEST_DATABASE_URL = URL.create(
    drivername="postgresql+psycopg",
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", "5432")),
    database="ai_task_manager_test",        # 不是database=os.getenv("DB_NAME")
)

test_engine = create_engine(
    TEST_DATABASE_URL,
    echo=True
)

def override_get_db():   # 替换，覆盖，重写 get_db
    with Session(test_engine) as session:
        yield session


# 根据你的 User、Task ORM models，在测试数据库里把对应的表创建出来
# Base.metadata.create_all(test_engine)
# 在这个 FastAPI app 里，只要有人请求 get_db，测试期间就用 override_get_db 替代
# 测试的时候，FastAPI 看到Depends(get_db)不要真的调用 get_db，而是偷偷换成get_test_db
#  pytest 时，把正常数据库入口替换成测试数据库入口
# app.dependency_overrides[get_db] = override_get_db

# 创建一个“假的浏览器/HTTP 客户端”，专门用来在测试里访问FastAPI 应用
# client = TestClient(app)   # TestClient → 直接访问 FastAPI app

# fixture: 固定装置、固定设备
@pytest.fixture
def client():       # 准备测试数据库和 TestClient
    # 每个测试都从一个干净数据库开始
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client     # 这个 test_client 就是要提供给测试函数的 client

    app.dependency_overrides.clear()  # 在测试结束以后， 清掉 override


@pytest.fixture
def auth_headers(client):  # 用 client 注册用户→ 登录→ 拿 JWT→ 返回 Authorization headers
    return register_and_login(client, "pytest_user", "pytest@example.com", "test123456")

