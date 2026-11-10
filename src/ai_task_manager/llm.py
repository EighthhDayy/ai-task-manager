import openai
import time
import json

from uuid import UUID

# 测试并发用
# from threading import Barrier

# test_race_barrier = Barrier(2)


from openai import OpenAI
from dotenv import load_dotenv
from ai_task_manager.schemas import ImprovedTask

from sqlalchemy import select
from sqlalchemy.orm import Session
from ai_task_manager.models import Task, User

from ai_task_manager.tool_schemas import tools


from sqlalchemy.exc import SQLAlchemyError, IntegrityError

import logging


logger = logging.getLogger(__name__)


load_dotenv()

client = OpenAI(timeout=20.0, max_retries=2)

class LLMServiceError(Exception):
    pass


def improve_task_title(title:str) -> str:
    # latency：在调用 LLM 前后各记一次时间，然后相减
    # start = time.perf_counter()
    # raise LLMServiceError("intentional test failure")
    try:
        response = client.responses.parse(
            model="gpt-5.6-luna",
            instructions=(
                "You improve task titles. "
                "Make the title clear, concise, and specific. "
            ),
            input=title,
            text_format=ImprovedTask
        )
        # 结束时候的时间
        # end = time.perf_counter()
        # 延迟时间 end-start
        # latency = end - start
        # print(f"LLM API call latency: {latency:.2f} seconds")
        parsed =  response.output_parsed  # 一个ImprovedTask对象
        # 做业务的验证
        if parsed is None:
            raise ValueError("LLM did not return a valid structured response")

        # 检查输出是否全为空格
        improved_title = parsed.improved_title.strip()  # 把字符串两边的空格去掉

        if not improved_title:
            return ValueError("LLM returned an empty title")

        return improved_title

    except openai.APITimeoutError as exc:
        raise LLMServiceError("LLM request timed out") from exc

    except openai.APIConnectionError as exc:
        raise LLMServiceError("Could not connect to LLM service") from exc

    except openai.RateLimitError as exc:
        raise LLMServiceError("LLM service rate limit reached") from exc

    except openai.APIStatusError as exc:
        raise LLMServiceError("LLM service returned an error") from exc


# 处理具体业务，并返回LLM回复的函数
def stream_ai_text(prompt: str):
    try:
        stream = client.responses.create(
        model="gpt-5.6-luna",
        instructions=(
                        "You answer this request in simply sentences"
                    ),
        input=prompt,
        stream=True,
        )

        for event in stream:
            if event.type == "response.output_text.delta":
                yield f"event: message\ndata: {event.delta}\n\n"   # \n\n表示:一条 SSE event 结束
        yield "event: done\ndata: complete\n\n"

    except openai.APITimeoutError:
        yield f"event: error\ndata: AI request timed out\n\n"

    except openai.APIConnectionError:
        yield f"event: error\ndata: AI connection was interrupted\n\n"

    except openai.APIStatusError:
        yield f"event: error\ndata: AI service returned an error\n\n"




# response = client.responses.create(
#     model="gpt-5.6-luna",
#     input="Create a task to buy milk",
#     tools=tools,
# )

# tool_call = response.output[0]   # ResponseFunctionToolCall(arguments（参数）='{"title":"Buy milk"}', call_id=……)   类型是对象
# arguments = json.loads(tool_call.arguments) # '{"title":"Buy milk"}' -> {"title":"Buy milk"}   类型从str变dic
# print(tool_call.name)
# print(arguments["title"])


# def create_task(title:str):
#     print(f"Actually creating task: {title}")

#     return {
#         "title": title,
#         "status": "created",
#     }



# 创建新任务。改写def create_task(title:str)函数
# 同一个用户，用同一个 operation_key 重复请求创建任务，数据库只能创建一条；
# 如果换一个 key，即使 title 相同，也可以创建新任务
# 幂等性保护的是“同一个逻辑操作只生效一次”
# def create_task_tool(
#         title: str,
#         current_user: User,
#         db:Session,
#         operation_key: str | None = None,
# ):
#     user_id = current_user.id
#     # 1.没有key: 用原来的创建流程
#     if operation_key is None:
#         task = Task(
#             title = title,
#             user_id = user_id
#         )

#         db.add(task)
#         db.commit()
#         db.refresh(task)

#         return {
#         "id": task.id,
#         "title": task.title,
#         "status": "created",
#         "replayed": False,
#         }

#     # 2.传过来了key，查看原本这个任务是否存在
#     stmt = (
#     select (Task).where(Task.user_id == user_id, Task.creation_key == operation_key)
#     )
#     existing_task = db.scalars(stmt).one_or_none()

#     # 2.1 原本这个任务存在
#     if existing_task is not None:
#         # 2.1.1 但是传过来的title和原本存在的task的title不一样，返回幂等性冲突：同一个用户拿着同样的opreation key只能请求一件事
#         if existing_task.title != title:
#             return {
#                 "status": "idempotency_conflict",
#             }
#         # 2.1.2 如果两次的title一样：那就把已经存在的task返给用户，这是重放
#         return{
#         "id": existing_task.id,
#         "title": existing_task.title,
#         "status": "created",
#         "replayed": True,
#         }

#     # 2.2 原本这个task不存在，那就新建这个task
#     # TEST ONLY: force two requests to pass the first SELECT
#     # if operation_key.startswith("force-race-"):
#     #     print("First SELECT found nothing; waiting at barrier")
#     #     test_race_barrier.wait(timeout=10)

#     task = Task(
#         title = title,
#         user_id = user_id,
#         creation_key = operation_key
#     )

#     # 处理并发请求
#     try:
#         db.add(task)
#         db.commit()

#     except IntegrityError:
#         # 并发测试用：print("HIT IntegrityError recovery path")
#         db.rollback()

#         stmt = (
#             select (Task).where(Task.user_id == user_id, Task.creation_key == operation_key)
#         )
#         existing_task = db.scalars(stmt).one_or_none()

#         # 01：没找到可能已经存在的任务
#         # 我本来想把这次 IntegrityError 识别成幂等键竞争，但重新查询后没有找到对应任务，所以我无法安全地处理它。把异常交给上层。
#         if existing_task is None:
#             raise

#         # 02：找到了这个任务，对比传进来的title和已经存在的task的title是否一样
#         # 先处理异常情况，然后正常情况继续往下
#         # 02.1: 传进来的title和已经存在的task的title不一样
#         if existing_task.title != title:
#             return {
#                     "status": "idempotency_conflict",   # 幂等键对应的请求内容发生冲突
#                 }
#         # 02.2 传进来的title和已经存在的task的title一样
#         return{
#                 "id": existing_task.id,
#                 "title": existing_task.title,
#                 "status": "created",
#                 "replayed": True,   # replay（重放）
#         }


#     # 2.3 新建了这个task
#     db.refresh(task)
#     return {
#         "id": task.id,
#         "title": task.title,
#         "status": "created",
#         "replayed": False,
#     }

def create_task_tool(
    title: str,
    current_user: User,
    db: Session,
    operation_key: str | None = None,
    description: str | None = None,
):
    user_id = current_user.id

    def same_request(task: Task) -> bool:
        return (
            task.title == title
            and task.description == description
        )

    def created_result(task: Task, replayed: bool) -> dict:
        return {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": "created",
            "replayed": replayed,
        }

    # 没有幂等键：正常创建
    if operation_key is None:
        task = Task(
            title=title,
            description=description,
            user_id=user_id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return created_result(task, replayed=False)

    # 查询该用户是否已有相同幂等键的任务
    stmt = select(Task).where(
        Task.user_id == user_id,
        Task.creation_key == operation_key,
    )
    existing_task = db.scalars(stmt).one_or_none()

    if existing_task is not None:
        if not same_request(existing_task):
            return {"status": "idempotency_conflict"}
        return created_result(existing_task, replayed=True)

    # 首次创建
    task = Task(
        title=title,
        description=description,
        user_id=user_id,
        creation_key=operation_key,
    )

    try:
        db.add(task)
        db.commit()
    except IntegrityError:
        # 保留原来的并发幂等恢复逻辑
        db.rollback()

        existing_task = db.scalars(
            select(Task).where(
                Task.user_id == user_id,
                Task.creation_key == operation_key,
            )
        ).one_or_none()

        if existing_task is None:
            raise

        if not same_request(existing_task):
            return {"status": "idempotency_conflict"}

        return created_result(existing_task, replayed=True)

    db.refresh(task)
    return created_result(task, replayed=False)



# 查看所有任务
def list_tasks_tool(
        current_user: User,
        db:Session
    ):
    user_id = current_user.id

    stmt = (
        select (Task).where(Task.user_id == user_id).order_by(Task.id)
    )
    tasks = db.scalars(stmt).all()
    # 普通 json.dumps() 并不知道怎么把Task(...)变成 JSON， 因此 list_tasks_tool() 返回普通 Python 数据
    result = []
    for task in tasks:
        result.append(
             {
            "id": task.id,
            "title": task.title,
            "completed": task.completed,
            "description": task.description
            }
    )

    return result

# 删除某个（task_id）任务
def delete_task_tool(
    task_id: int,
    current_user: User,
    db:Session
    ):

    user_id = current_user.id
    # 先找出要删除那个task，它必须是本用户的task
    stmt = select(Task).where(Task.id == task_id, Task.user_id == user_id)
    deleted_task = db.scalars(stmt).one_or_none()

    if deleted_task is None:
        return {
            "status": "not_found",
            "task_id": task_id,
        }

    db.delete(deleted_task)
    db.commit()

    return {"message": f"Task {task_id} deleted"}

# 更新某个（task_id）任务已经完成
def complete_task_tool(
    task_id: int,
    completed: bool,
    current_user: User,
    db:Session
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
        return {
            "status": "not_found",
            "task_id": task_id,
        }


    # 测试操作数据库失败： raise SQLAlchemyError("TEST ONLY: simulated database failure")
    task.completed = completed

    db.commit()
    db.refresh(task)

    return {
        "id": task.id,
        "title": task.title,
        "completed": task.completed,
        "status": "updated",
    }




# tool_call = response.output[0]
# arguments = json.loads(tool_call.arguments)
# if tool_call.name == "create_task":
#     result = create_task(arguments["title"])

# print(result)

# second_response = client.responses.create(
#      model="gpt-5.6-luna",
#      previous_response_id=response.id,       # 这是刚才那一次对话的继续，不是一段全新的无关请求。
#      input=[
#          {
#           "type": "function_call_output",
#           "call_id": tool_call.call_id,        # 这个结果对应你刚才哪一个 function call
#           "output": json.dumps(result)     #把dic转变成str

#          }
#      ]
# )

# print(second_response.output_text)

# print("以下为运行agent函数的输出：")


# Tool dispatcher（工具分发器）：判断tool的类型，执行工具对应的函数，返回函数的运行结果
def execute_tool(
        tool_call,
        db: Session,
        current_user: User,
        operation_key: str | None = None
    ):
    arguments = json.loads(tool_call.arguments) # str变dic

    if tool_call.name == "create_task":
        # 调用函数

        # return create_task_tool(
        #     title = title,
        #     db = db,
        #     current_user = current_user,
        #     operation_key=operation_key
        # )

        return create_task_tool(
            title=arguments["title"],
            description=arguments.get("description"),
            db=db,
            current_user=current_user,
            operation_key=operation_key,
        )

    elif tool_call.name == "list_tasks":
        return list_tasks_tool(
            current_user = current_user,
            db = db,
        )

    elif tool_call.name == "delete_task":
        task_id = arguments["task_id"]
        return delete_task_tool(
            task_id = task_id,
            db = db,
            current_user = current_user
        )

    elif tool_call.name == "complete_task":
        task_id = arguments["task_id"]
        completed = arguments["completed"]
        return complete_task_tool(
            task_id = task_id,
            completed=completed,
            db = db,
            current_user = current_user
        )

    else:
        raise ValueError(f"Unknown tool: {tool_call.name}")


# 运行agent的函数
def run_agent(
        user_input:str,
        request_id: UUID,
        db: Session,
        current_user: User,
    ):

    print(f"Agent request ID: {request_id}")

    response = client.responses.create(
        model="gpt-5.6-luna",
        input=user_input,
        tools=tools,
    )

    # Agent loop
    MAX_STEPS = 5
    successful_actions = []
    tool_events = []

    create_index = 0

    for step in range(MAX_STEPS):

        print(f"Agent step: {step + 1}")

        function_calls = []
        for item in response.output:
            if item.type == "function_call":        # response.output 里可能有很多不同类型的 item
                function_calls.append(item)         # 我们不再假设 response.output[0] 一定是工具调用，而是先检查类型

        if not function_calls:      # Python 里[]在布尔判断里等价于 False
            return {"answer": response.output_text, "tool_events": tool_events}

        # 记录函数的返回结果，以及准备好要给LLM的内容
        tool_outputs = []

        for tool_call in function_calls:

            print(f"Calling tool: {tool_call.name}")

            operation_key = None
            if tool_call.name == "create_task":
                create_index += 1
                operation_key = f"{request_id}:create:{create_index}"

            try:
                result = execute_tool(
                    tool_call,
                    db=db,
                    current_user=current_user,
                    operation_key=operation_key,
                )

            except SQLAlchemyError:
                logger.exception(          # logger: 更适合后端服务的 print().记录一条 AI 服务失败的异常日志，并把这次异常的详细堆栈也记下来。
                    "Database error while executing tool: %s",
                    tool_call.name
                )

                db.rollback()
                tool_events.append({
                    "name": tool_call.name,
                    "arguments": {},
                    "result": {"code": "database_error"},
                    "status": "error",
                })

                # 遇到异常，return 失败报告，之后停止agent
                return {
                        "status": "partial_failure" if successful_actions else "error", #根据是否已经有了成功执行的task来区分告诉llm是局部失败还是error
                        "successful_actions": successful_actions,
                        "failed_tool": tool_call.name,
                        "code": "database_error",
                        "failed_tool_outcome": "unconfirmed",
                        "answer": "数据库操作失败；如果涉及写入，请先检查任务列表确认结果。",
                        "tool_events": tool_events,
                    }


            # Record actual execution, not the model's claimed action. Whitelist safe fields.
            try:
                raw_args = json.loads(tool_call.arguments or "{}")
            except (ValueError, TypeError):
                raw_args = {}
            visible_args = ({k: raw_args[k] for k in ("title", "description", "task_id", "id") if k in raw_args}
                            if isinstance(raw_args, dict) else {})
            if isinstance(result, dict):
                visible_result = {k: result[k] for k in ("status", "id", "title", "description", "completed", "message", "code") if k in result}
            elif isinstance(result, list):
                visible_result = {"count": len(result)}
            else:
                visible_result = {"type": type(result).__name__}
            failed_statuses = {"error", "failed", "not_found", "denied"}
            event_status = ("error" if isinstance(result, dict) and result.get("status") in failed_statuses else "success")
            tool_events.append({
                "name": tool_call.name,
                "arguments": visible_args,
                "result": visible_result,
                "status": event_status,
            })

            if tool_call.name == "create_task" and isinstance(result, dict) and result.get("status") == "created":
                successful_actions.append({"tool": tool_call.name, "task_id": result["id"], "title": result["title"],})

            print(f"Tool result: {result}")
            # tool_outputs 里面不能只放 result，而要放一个完整的 function_call_output 包裹
            tool_outputs.append(
                {
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": json.dumps(result)
                }
            )
        # 把所有调用tool的执行结果告诉llm
        response = client.responses.create(
            model="gpt-5.6-luna",
            tools=tools,
            previous_response_id=response.id,
            input=tool_outputs,      # 你刚才要求我执行的那些 function call，我已经执行完了，这是结果
        )

    raise RuntimeError("Agent exceeded maximum steps")


# 测试要调用不存在的函数：raise ValueError(f"Unknown tool: {tool_call.name}")
# fake_tool_call = SimpleNamespace(
#     name="delete_everything",
#     arguments="{}",
# )

# print(execute_tool(fake_tool_call))
