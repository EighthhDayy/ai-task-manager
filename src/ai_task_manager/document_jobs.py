import os
from pathlib import Path

from sqlalchemy.orm import Session

from ai_task_manager.database import engine
from ai_task_manager.ingestion import index_pdf_document


def process_pdf_job(
    upload_id: str,
    source_id: str,
    user_id: int,
    filename: str | None = None,  # Jobs queued before this change have only three args.
) -> dict:

    # 1. Worker 读取之前保存的 PDF
    upload_dir = Path(os.environ["UPLOAD_DIR"])
    pdf_path = upload_dir / f"{upload_id}.pdf"

    pdf_bytes = pdf_path.read_bytes()

    # 2. Worker 自己创建数据库 Session
    # Worker 不处理 HTTP 请求，也不运行 FastAPI 的依赖注入。因此 Worker 要自己创建 Session
    with Session(engine) as db:
        result = index_pdf_document(
            source_id=source_id,
            pdf_bytes=pdf_bytes,
            user_id=user_id,
            db=db,
            filename=filename,
        )

    # 3. 成功后删除临时 PDF
    pdf_path.unlink(missing_ok=True)

    return result
