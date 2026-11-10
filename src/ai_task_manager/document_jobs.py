import os
from pathlib import Path

from sqlalchemy.orm import Session

from ai_task_manager.database import engine
from ai_task_manager.pdf_utils import extract_pdf_text
from ai_task_manager.ingestion import index_document


def process_pdf_job(
    upload_id: str,
    source_id: str,
    user_id: int,
) -> dict:

    # 1. Worker 读取之前保存的 PDF
    upload_dir = Path(os.environ["UPLOAD_DIR"])
    pdf_path = upload_dir / f"{upload_id}.pdf"

    pdf_bytes = pdf_path.read_bytes()

    # 2. 提取文字；扫描页面自动走 OCR
    text = extract_pdf_text(pdf_bytes)

    # 3. Worker 自己创建数据库 Session
    # Worker 不处理 HTTP 请求，也不运行 FastAPI 的依赖注入。因此 Worker 要自己创建 Session
    with Session(engine) as db:
        result = index_document(
            source_id=source_id,
            text=text,
            user_id=user_id,
            db=db,
        )

    # 4. 成功后删除临时 PDF
    pdf_path.unlink(missing_ok=True)

    return result
