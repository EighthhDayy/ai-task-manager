# 定义Tool
# 告诉模型：你有这么一个工具可以请求调用。
# LLM 可以控制的东西→ 放进 tool schema.后端自己掌握的东西→ 不放进 tool schema
tools = [
    # {
    #     "type": "function",
    #     "name": "create_task",
    #     "description": "Create a new task for the current user.",
    #     # 如果你要调用这个 tool，LLM需要给这个 tool 传什么东西？
    #     "parameters": {     # 这个 tool 接收什么参数，以及每个参数是什么类型、什么意思。
    #         "type": "object",    # 这个 tool 的参数整体应该是一个对象，也就是 { ... } 这种结构
    #         "properties": {     # 这个参数对象里面允许有哪些字段
    #             "title": {
    #                 "type": "string",
    #                 "description": "The title of the task."
    #             }
    #         },
    #         "required": ["title"],      # 模型如果调用 create_task，必须给 title
    #         "additionalProperties": False   # 不要随便多塞
    #     },
    #     "strict": True      # 求模型严格遵循定义的参数 schema
    # },
    {
        "type": "function",
        "name": "create_task",
        "description": "Create a new task with an optional description for the current user.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "The title of the task."
                },
                "description": {
                    "type": ["string", "null"],
                    "description": "An optional task description. Use null if the user does not provide one."
                }
            },
            "required": ["title", "description"],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "list_tasks",
        "description": "List all of this user's tasks.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "delete_task",
        "description": "Delete the current user's task.",

        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "The ID of the task to delete."
                }
            },
            "required": ["task_id"],
            "additionalProperties": False
        },
        "strict": True
    },
    {
        "type": "function",
        "name": "complete_task",
        "description": "Mark the current user's task as completed or not completed.",

        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "description": "The ID of the task."
                },
                "completed":{
                    "type": "boolean",
                    "description": "Whether the current user's task has been completed."
                }

            },
            "required": ["task_id", "completed"],
            "additionalProperties": False
        },
        "strict": True
    }
]
