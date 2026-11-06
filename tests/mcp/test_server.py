"""Exercise MCP discovery, wire transport, REST auth and task persistence."""

import os
import sys

import httpx
import pytest

pytest.importorskip("mcp")

from fastapi.testclient import TestClient
from mcp import Client, StdioServerParameters
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from main import app
from ai_task_manager.database import get_db
from ai_task_manager.mcp_server import create_server
from ai_task_manager.models import Base


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def api(monkeypatch):
    # Own database and dependency override: these tests need no running PostgreSQL.
    from ai_task_manager import auth

    monkeypatch.setattr(auth, "SECRET_KEY", "mcp-test-secret-key-not-for-production")
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def database():
        with Session(engine) as session:
            yield session

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = database
    with TestClient(app) as client:
        tokens = []
        for username in ["alice", "bob"]:
            assert client.post("/users", json={
                "username": username, "email": f"{username}@example.com",
                "password": "test-password",
            }).status_code == 201
            response = client.post("/login", json={
                "username": username, "password": "test-password",
            })
            assert response.status_code == 200
            tokens.append(response.json()["access_token"])
        yield tokens, httpx.ASGITransport(app=app), client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    engine.dispose()


@pytest.mark.anyio
async def test_mcp_crud_and_user_isolation(api):
    tokens, transport, rest = api
    alice = create_server("http://localhost", tokens[0], transport=transport)
    bob = create_server("http://localhost", tokens[1], transport=transport)
    async with Client(alice, raise_exceptions=True) as client:
        listed = await client.list_tools()
        assert {tool.name for tool in listed.tools} == {
            "list_tasks", "create_task", "complete_task",
        }
        definitions = {tool.name: tool for tool in listed.tools}
        assert definitions["list_tasks"].annotations.read_only_hint is True
        assert definitions["create_task"].annotations.idempotent_hint is False
        assert definitions["complete_task"].input_schema["properties"]["task_id"]["exclusiveMinimum"] == 0
        # Neither credentials nor arbitrary user identity are model-facing inputs.
        for tool in listed.tools:
            assert "token" not in tool.input_schema["properties"]
            assert "user_id" not in tool.input_schema["properties"]

        created = await client.call_tool("create_task", {
            "title": "  Prepare MCP demo  ", "description": "Show task tools",
        })
        assert not created.is_error
        task = created.structured_content
        assert task["title"] == "Prepare MCP demo"
        assert task["completed"] is False
        task_id = task["id"]

        async with Client(bob, raise_exceptions=True) as other:
            empty = await other.call_tool("list_tasks", {})
            assert empty.structured_content["result"] == []
            denied = await other.call_tool("complete_task", {"task_id": task_id})
            assert denied.is_error
            assert "TASK_NOT_FOUND" in denied.content[0].text

        completed = await client.call_tool("complete_task", {"task_id": task_id})
        assert not completed.is_error
        assert completed.structured_content["completed"] is True
        repeated = await client.call_tool("complete_task", {"task_id": task_id})
        assert not repeated.is_error
        tasks = await client.call_tool("list_tasks", {})
        assert tasks.structured_content["result"] == [completed.structured_content]

        persisted = rest.get("/my/tasks", headers={"Authorization": f"Bearer {tokens[0]}"})
        assert persisted.json() == [completed.structured_content]


@pytest.mark.anyio
async def test_invalid_arguments_never_reach_api():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(500)

    server = create_server("http://localhost", "test-token", transport=httpx.MockTransport(handler))
    async with Client(server, raise_exceptions=True) as client:
        for name, arguments in [
            ("create_task", {"title": "   "}),
            ("create_task", {"title": "x" * 501}),
            ("complete_task", {"task_id": -1}),
            ("complete_task", {"task_id": "invalid"}),
        ]:
            result = await client.call_tool(name, arguments)
            assert result.is_error
        assert calls == []


@pytest.mark.anyio
@pytest.mark.parametrize("status,code", [
    (401, "AUTH_REQUIRED"), (403, "AUTH_REQUIRED"), (404, "TASK_NOT_FOUND"),
    (422, "INVALID_ARGUMENTS"), (503, "API_ERROR"), (302, "API_ERROR"),
])
async def test_api_errors_are_sanitized(status, code):
    def handler(request):
        assert request.headers["Authorization"] == "Bearer private-token"
        return httpx.Response(status, text="private backend details and private-token")

    server = create_server("http://localhost", "private-token", transport=httpx.MockTransport(handler))
    async with Client(server, raise_exceptions=True) as client:
        result = await client.call_tool("list_tasks", {})
        assert result.is_error
        assert code in result.content[0].text
        assert "private" not in result.content[0].text


@pytest.mark.anyio
@pytest.mark.parametrize("failure,code", [
    (httpx.ReadTimeout, "API_TIMEOUT"), (httpx.ConnectError, "API_UNAVAILABLE"),
])
async def test_network_errors(failure, code):
    def handler(request):
        raise failure("private connection details", request=request)

    server = create_server("http://localhost", "test-token", transport=httpx.MockTransport(handler))
    async with Client(server, raise_exceptions=True) as client:
        result = await client.call_tool("create_task", {"title": "demo"})
        assert result.is_error
        assert code in result.content[0].text
        assert "private" not in result.content[0].text


@pytest.mark.anyio
@pytest.mark.parametrize("body", [b"not-json", b'{"unexpected": true}'])
async def test_invalid_api_response(body):
    server = create_server("http://localhost", "test-token", transport=httpx.MockTransport(
        lambda request: httpx.Response(200, content=body),
    ))
    async with Client(server, raise_exceptions=True) as client:
        result = await client.call_tool("list_tasks", {})
        assert result.is_error
        assert "INVALID_RESPONSE" in result.content[0].text


@pytest.mark.anyio
async def test_invalid_token_rejected_by_real_api(api):
    _, transport, _ = api
    server = create_server("http://localhost", "invalid-jwt", transport=transport)
    async with Client(server, raise_exceptions=True) as client:
        result = await client.call_tool("list_tasks", {})
        assert result.is_error
        assert "AUTH_REQUIRED" in result.content[0].text


@pytest.mark.parametrize("url,token", [
    ("ftp://localhost", "test"), ("http://remote.example", "test"),
    ("http://user:password@localhost", "test"), ("http://localhost?token=x", "test"),
    ("http://localhost", ""), ("http://localhost", "x\ny"),
])
def test_configuration_validation(url, token):
    with pytest.raises(ValueError):
        create_server(url, token)


@pytest.mark.anyio
async def test_stdio_subprocess_tool_discovery():
    env = dict(os.environ)
    env["AI_TASK_MANAGER_TOKEN"] = "test-token-for-discovery-only"
    env["AI_TASK_MANAGER_API_URL"] = "http://localhost:8000"
    params = StdioServerParameters(
        command=sys.executable, args=["-m", "ai_task_manager.mcp_server"], env=env,
    )
    async with Client(params) as client:
        tools = await client.list_tools()
        assert len(tools.tools) == 3
