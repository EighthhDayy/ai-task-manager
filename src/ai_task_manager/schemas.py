from pydantic import BaseModel, ConfigDict, Field

from uuid import UUID

# Pydantic Schema。Pydantic = 用 Python 类来定义数据结构，并自动校验数据是否符合要求。
class TaskCreate(BaseModel):   # 规定：API 接收到的数据，应该长什么样
    title: str
    completed: bool = False
    description: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None
    description: str | None = None


class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)  # 你拿到的数据不一定是 dict，也可能是一个 ORM 对象，请允许通过“属性”读取字段。

class TaskResponse(BaseModel):
    id: int
    title: str
    completed: bool
    user_id: int
    description: str | None

    model_config = ConfigDict(from_attributes=True)

class ImproveTaskRequest(BaseModel):
    title: str

class ImproveTaskResponse(BaseModel):
    improved_title: str

class ImprovedTask(BaseModel):
    improved_title: str = Field(        # 做格式的验证
        min_length = 1,
        max_length = 120
    )

class StreamAIRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)


class AgentRequest(BaseModel):
    prompt: str
    request_id: UUID


class AskDocsRequest(BaseModel):
    question:str

class AskDocsResponse(BaseModel):
    answer:str
    retrieved_chunk_ids: list[str]


class IndexDocumentRequest(BaseModel):
    source_id: str = Field(min_length=1) # 拦截空字符串
    text: str = Field(min_length=1)


class IndexDocumentResponse(BaseModel):
    source_id: str
    chunk_count: int

# Qwen问题及回答的schema
class TransformerQuestion(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=400)


class ModelAnswer(BaseModel):
    answer: str
    model: str

class TransformerAnswer(ModelAnswer):
    source_url: str
