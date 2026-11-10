# 创建 Redis 任务队列

# config:配置

import os

from redis import Redis
from rq import Queue
from rq.serializers import JSONSerializer


REDIS_URL = os.getenv(
    "REDIS_URL",
    "redis://127.0.0.1:6379/0",
)

redis_connection = Redis.from_url(REDIS_URL)    # 创建 Redis 客户端

document_queue = Queue(
    "documents",        # 创建一个名叫 documents 的逻辑任务队列
    connection=redis_connection,
    serializer=JSONSerializer, # 使用 JSON 序列化任务参数，而不使用 RQ 默认的 Pickle 格式
)

