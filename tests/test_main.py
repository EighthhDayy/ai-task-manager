from tests.helpers import register_and_login

# 创建一个假的 HTTP 客户端，直接访问 FastAPI app
# client = TestClient(app)

# 测试根路径
def test_root(client):
    response = client.get("/")   # response 是一个 HTTP Response 对象
    # assert：我断言这件事必须是真的
    assert response.status_code == 200  # 响应状态码
    data = response.json()   # 响应正文里的 JSON 解析成 Python 数据。数据类型：字典
    assert data["status"] == "running"  

# 测试注册用户
def test_register_user(client):
    response = client.post(
        "/users",
        # 这些数据作为 JSON 发给后端, 因为post() 需要知道这份数据到底应该怎么发送，是 JSON？表单？文件？纯文本？
        json={                  # JSON 是用来传输/保存数据的一种文本格式
            "username": "pytest_user",
            "email": "pytest@example.com",
            "password": "test123456"
        }
    )
    assert response.status_code == 201 
    
    data = response.json()          #把服务器返回的 JSON，再解析成 Python 字典
    
    assert data["username"] == "pytest_user"  

def test_duplicate_user_returns_409(client):
    user_data = {
        "username": "pytest_user",
        "email": "pytest@example.com",
        "password": "test123456"
    }
    first_response = client.post(
        "/users",
        json=user_data
    )

    second_response = client.post(
        "/users",
        json=user_data
    )
    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "Username or email already exists"

# 测试正确密码登录
def test_login_success(client):
    user_data = {
        "username": "pytest_user",
        "email": "pytest@example.com",
        "password": "test123456"
    }
    client.post("/users",
                json = user_data
    )

    response = client.post("/login",
                json={                  
                    "username": "pytest_user",
                    "password": "test123456"
                }   
                           )
    assert response.status_code == 200
    data = response.json()              #把服务器返回的 JSON，再解析成 Python 字典
    # 登录成功以后，response 里必须存在 access_token
    assert "access_token" in data
    assert data["token_type"] == "bearer"

# 测试错误密码登录
def test_login_wrong_password(client):
    # 先post用户
    user_data = {
        "username": "pytest_user",
        "email": "pytest@example.com",
        "password": "test123456"
    }

    client.post(
        "/users",
        json = user_data
    )

    response = client.post(
        "/login",
        json={
        "username": "pytest_user",
        "password": "wrong_password"
        }
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"

# 测试 get me
def test_get_me(client, auth_headers):  # pytest 会自动理解：这个测试需要 client 和 auth_headers 两个 fixture
    # 注册一个新用户
    # user_data = {
    #     "username": "pytest_user",
    #     "email": "pytest@example.com",
    #     "password": "test123456"
    # }
    # client.post("users", json=user_data)
    # # 登录
    # login_response = client.post("/login", 
    #     json={
    #     "username": "pytest_user",
    #     "password": "test123456"
    # }
    # )
    # # 拿到token
    # token = login_response.json()["access_token"]
    # # 准备 Authorization header
    # headers = {
    #     "Authorization": f"Bearer {token}"
    # }

    # 带着 JWT 请求受保护接口
    response = client.get(
        "/me", 
        headers = auth_headers    # security = HTTPBearer()负责从这个 header 中拆出 scheme = Bearer, credentials = eyJhbGciOi...
    )
    # 检查结果
    assert response.status_code == 200
    assert response.json()["username"] == "pytest_user"

def test_get_me_without_token(client):
    response = client.get("/me")
    assert response.status_code == 401


def test_create_tasks(client, auth_headers):
    task = {
        "title": "Learn pytest",
            "completed": False,
            "description": "Test task creation"
    }
    response = client.post(
        "/my/tasks",
        headers=auth_headers,   #得有授权
        json = task
    )
    data = response.json()
    assert response.status_code == 201

    assert data["title"] == "Learn pytest"
    assert data["completed"] is False
    assert data["description"] == "Test task creation"

# 测试GET /my/tasks，因为得先create task
def test_get_tasks(client, auth_headers):
    # 测试的数据库环境和引擎已准备好
    # 用户已经注册
    # 给用户创造task
    task = {
            "title": "Learn pytest",
            "completed": False,
            "description": "Test task creation"
        }
    create_response = client.post(
            "/my/tasks",
            headers=auth_headers,  
            json = task
        )
    # 后面的GET测试依赖“前面的 task 成功创建”，如果 POST 自己失败了，而完全不检查，那么后面 GET 失败时，你可能误以为是 GET 坏了
    assert create_response.status_code == 201       

    response = client.get(      # 返回的是一个 task 列表，不是一个 task
        "/my/tasks",
        headers=auth_headers
    )


    assert response.status_code == 200

    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Learn pytest"
    assert data[0]["completed"] is False
    assert data[0]["description"] == "Test task creation"

# 测试patch /my/tasks/{task_id}
def test_update_task(client, auth_headers):
    # 1.先post一个task
    task = {
            "title": "Learn pytest",
            "completed": False,
            "description": "Old description"
        }

    create_response = client.post(
                "/my/tasks",
                headers=auth_headers,  
                json = task
            )
    assert create_response.status_code == 201
    task_data = create_response.json()  
    # 拿到这个task的id
    task_id = task_data["id"]

    # 2.开始测试更新我的某个task
    response = client.patch(
        f"/my/tasks/{task_id}",     # 不加f"", Python 会把{task_id}当成普通字符串,大括号里的字不会自动替换. f"普通文字 {变量或表达式}"
        headers=auth_headers,
        json={
            "title": "Learn pytest deeply",
            "completed": True
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Learn pytest deeply"
    assert data["completed"] is True
    assert data["description"] == "Old description"

    # 3.看看是不是真的改了
    get_response = client.get(
    "/my/tasks",
    headers=auth_headers
    )

    tasks = get_response.json()
    assert tasks[0]["title"] == "Learn pytest deeply"
    assert tasks[0]["completed"] is True
    assert tasks[0]["description"] == "Old description"

    # POST→ 创建   PATCH→ 修改    GET→ 再查一次确认真的保存进数据库: 这叫验证 persistence（持久化）



# 测试删除 /my/tasks/{task_id}
def test_delete(client, auth_headers):
    # 1.先post一个task
    task = {
            "title": "Learn pytest",
            "completed": False,
            "description": "Old description"
        }

    create_response = client.post(
                "/my/tasks",
                headers=auth_headers,  
                json = task
            )
    assert create_response.status_code == 201
    task_data = create_response.json()  
    # 拿到这个task的id
    task_id = task_data["id"]

    # 2.删除这个task
    response = client.delete(
        f"/my/tasks/{task_id}",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Task deleted"

    # 确认是否真的删掉了
    get_response = client.get(
        "/my/tasks",
        headers=auth_headers
    )

    assert get_response.status_code == 200
    tasks = get_response.json()
    assert len(tasks) == 0


# 测试更新——B用户是否能更改A用户的任务
def test_user_cannot_update_another_users_task(client):
    # 1.拿到user_a的headers_a
    headers_a = register_and_login(client, "user_a", "a@example.com", "password123")
    # 2.给user_a创建一个task,并拿到task_id
    create_response = client.post(
        "/my/tasks",
        headers=headers_a,
        json={
            "title": "User A task",
            "completed": False,
            "description": "Private task"
        }
    )
    task_id = create_response.json()["id"]

    # 3.拿到user_b的headers_b
    headers_b = register_and_login(client, "user_b", "b@example.com", "password123")

    # 4.用user_b的headers去改user_a的task
    response = client.patch(
        f"/my/tasks/{task_id}",
        headers=headers_b,
        json={
            "title": "Hacked"
        }
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found"

    # 7.user_a再次查询自己的tasks，确保没有被更新
    get_response = client.get(
        "/my/tasks",
        headers=headers_a
    )
    assert get_response.status_code == 200

    tasks = get_response.json()

    assert len(tasks) == 1
    assert tasks[0]["id"] == task_id
    assert tasks[0]["title"] == "User A task"
    assert tasks[0]["description"] == "Private task"


def test_user_cannot_delete_another_users_task(client):
    # 1.拿到user_a的headers_a
    headers_a = register_and_login(client, "user_a", "a@example.com", "password123")
    # 2.给user_a创建一个task,并拿到task_id
    create_response = client.post(
        "/my/tasks",
        headers=headers_a,
        json={
            "title": "User A task",
            "completed": False,
            "description": "Private task"
        }
    )
    task_id = create_response.json()["id"]

    # 3.拿到user_b的headers_b
    headers_b = register_and_login(client, "user_b", "b@example.com", "password123")

    # 4.用user_b的headers去删除user_a的task
    response = client.delete(
        f"/my/tasks/{task_id}",
        headers=headers_b
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found"

    # 5.user_a再次查询自己的tasks，确保没有被删除
    get_response = client.get(
        "/my/tasks",
        headers=headers_a
    )
    assert get_response.status_code == 200

    tasks = get_response.json()

    assert len(tasks) == 1
    assert tasks[0]["id"] == task_id