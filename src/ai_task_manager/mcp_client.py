"""Small stdio client for discovery and explicit tool calls, without an LLM."""

import argparse
import asyncio
import json
import os
import sys

from dotenv import load_dotenv
from mcp import Client, StdioServerParameters


async def run(tool: str | None, arguments: dict) -> bool:
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "ai_task_manager.mcp_server"],
        env=dict(os.environ),
    )
    async with Client(params) as client:
        if tool is None:
            tools = await client.list_tools()
            for definition in tools.tools:
                print(definition.model_dump_json(indent=2, by_alias=True))
            return True
        result = await client.call_tool(tool, arguments)
        print(result.model_dump_json(indent=2, by_alias=True))
        return not result.is_error


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tool", nargs="?", choices=["list_tasks", "create_task", "complete_task"])
    parser.add_argument("--arguments", default="{}", help="Tool arguments as a JSON object")
    args = parser.parse_args()
    try:
        arguments = json.loads(args.arguments)
    except json.JSONDecodeError:
        parser.error("--arguments must be valid JSON")
    if not isinstance(arguments, dict):
        parser.error("--arguments must be a JSON object")
    if not asyncio.run(run(args.tool, arguments)):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
