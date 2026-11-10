def register_and_login(client, username, email, password):
    # 1. 注册新用户
    register_response = client.post(
        "/users",
        json = {
            "username": username,
            "email": email,
            "password": password 
        }
    )

    assert register_response.status_code == 201
    # 2.登录
    login_response = client.post(
        "/login",
        json={
            "username": username,
            "password": password 
        }

    )

    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    return {
        "Authorization": f"Bearer {token}"
    }
