import logging

logger = logging.getLogger(__name__)

# HTTP请求的路由
from fastapi import APIRouter, Depends, HTTPException, File, Form, Response, UploadFile


from ai_task_manager.schemas import ImproveTaskRequest, ImproveTaskResponse, StreamAIRequest, AgentRequest, AskDocsRequest, AskDocsResponse
from ai_task_manager.auth import get_current_user

from ai_task_manager.models import Document, DocumentChunk, User
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from ai_task_manager.database import get_db

from ai_task_manager.llm import improve_task_title, LLMServiceError, stream_ai_text, run_agent

from fastapi.responses import StreamingResponse

from ai_task_manager.rag import answer_with_rag


from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.serializers import JSONSerializer
from redis.exceptions import RedisError

from ai_task_manager.queue_config import redis_connection


from openai import OpenAIError
from sqlalchemy.exc import SQLAlchemyError

from ai_task_manager.schemas import (
    DocumentSummary,
    IndexDocumentRequest,
    IndexDocumentResponse,
)

from ai_task_manager.ingestion import index_document, index_pdf_document


import os

from pathlib import Path
from uuid import uuid4

from ai_task_manager.queue_config import document_queue



router = APIRouter(tags=["AI Function"])


def pdf_filename(filename: str | None) -> str:
    # The client-provided name is display metadata, never a storage path.
    return (filename or "").replace("\\", "/").rsplit("/", 1)[-1].replace("\x00", "").strip()


@router.post("/ai/improve-task", status_code=200, response_model=ImproveTaskResponse)
def openai_improve_task(
    request: ImproveTaskRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        result = improve_task_title(request.title)
        return ImproveTaskResponse(
                    improved_title = result
                )
    except LLMServiceError:
        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable",
        )

@router.post("/ai/stream", status_code=200)
def stream_ai(request: StreamAIRequest):
    return StreamingResponse(           # StreamingResponse 需要的是一个可以不断取数据的 iterable/generator
        stream_ai_text(request.prompt),
        media_type="text/event-stream",        # HTTP 响应返回的内容，是什么类型的数据:文本事件流，表示这些数据遵循 SSE 协议格式。
    )

@router.post("/ai/agent")
def agent_route(
    request: AgentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return run_agent(
        request.prompt,
        request.request_id,
        db = db,
        current_user=current_user
    )

@router.post("/ai/ask-docs", response_model=AskDocsResponse)
def ask_docs_route(
    request:AskDocsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = answer_with_rag(question=request.question, db=db, user_id=current_user.id,)
        # **result是把字典里的键值对展开成关键字参数
        return AskDocsResponse(
            **result
        )

    except OpenAIError:
        logger.exception("RAG OpenAI request failed")
        raise HTTPException(
            status_code=503,
            detail="RAG service is temporarily unavailable",
        )

    except SQLAlchemyError:
        logger.exception("RAG database query failed")
        raise HTTPException(
            status_code=503,
            detail="RAG service is temporarily unavailable",
        )

@router.get("/ai/documents", response_model=list[DocumentSummary])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chunk_count = (
        select(func.count())
        .select_from(DocumentChunk)
        .where(
            DocumentChunk.owner_id == Document.owner_id,
            DocumentChunk.source_id == Document.source_id,
        )
        .scalar_subquery()
    )
    stmt = (
        select(
            Document.id,
            Document.source_id,
            Document.filename,
            Document.indexed_at,
            chunk_count.label("chunk_count"),
        )
        .where(Document.owner_id == current_user.id)
        .order_by(Document.indexed_at.desc().nulls_last(), Document.id.desc())
    )
    try:
        return [DocumentSummary(**row) for row in db.execute(stmt).mappings()]
    except SQLAlchemyError:
        logger.exception("Document list database query failed")
        raise HTTPException(status_code=503, detail="Document list is temporarily unavailable")


@router.delete("/ai/documents/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        delete(Document)
        .where(Document.id == document_id, Document.owner_id == current_user.id)
        .returning(Document.id)
    )
    try:
        deleted_id = db.execute(stmt).scalar_one_or_none()
        if deleted_id is None:
            raise HTTPException(status_code=404, detail="Document not found")
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Document deletion failed")
        raise HTTPException(status_code=503, detail="Document deletion is temporarily unavailable")
    return Response(status_code=204)


@router.post("/ai/documents", response_model=IndexDocumentResponse, status_code=200)
def upload_document(
    request: IndexDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = index_document(
            source_id=request.source_id,
            text=request.text,
            user_id=current_user.id,
            db=db
        )
        return IndexDocumentResponse(**result)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        )
    except OpenAIError:
        logger.exception("Document embedding failed")
        raise HTTPException(
            status_code=503,
            detail="Embedding service is temporarily unavailable",
        )

    except SQLAlchemyError:
        logger.exception("Document indexing database operation failed")
        raise HTTPException(
            status_code=503,
            detail="Document indexing is temporarily unavailable",
        )

@router.post(
    "/ai/documents/upload", response_model=IndexDocumentResponse
)
def upload_pdf_document(
    # Form 是 FastAPI 提供的函数，用来声明：这个参数应该从 HTTP 请求的表单字段中提取
    # Form(...) 这个位置，它表示：这是必填参数。
    source_id: str = Form(...),
    file: UploadFile = File(...),       # 这个参数应该从 HTTP 请求的上传文件字段中取得
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. 检查文件名
    filename = pdf_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=422,
            detail="Only PDF files are supported",
        )

    # 2. 最多读取 5 MB + 1 byte
    max_size = 5 * 1024 * 1024

    pdf_bytes = file.file.read(max_size + 1)

    if len(pdf_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail="PDF exceeds 5 MB",
        )

    try:
        result = index_pdf_document(
            source_id=source_id,
            pdf_bytes=pdf_bytes,
            user_id=current_user.id,
            db=db,
            filename=filename,
        )

        return IndexDocumentResponse(**result)

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except OpenAIError:
        logger.exception("PDF embedding failed")
        raise HTTPException(
            status_code=503,
            detail="Embedding service is temporarily unavailable",
        )

    except SQLAlchemyError:
        logger.exception("PDF indexing database operation failed")
        raise HTTPException(
            status_code=503,
            detail="Document indexing is temporarily unavailable",
        )


@router.post(
    "/ai/documents/upload-async",
    status_code=202,
)
def upload_pdf_async(
    source_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    source_id = source_id.strip()

    if not source_id or len(source_id) > 100:
        raise HTTPException(
            status_code=422,
            detail="Invalid source_id",
        )

    filename = pdf_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=422,
            detail="Only PDF files are supported",
        )

    max_size = 5 * 1024 * 1024
    pdf_bytes = file.file.read(max_size + 1)

    if len(pdf_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail="PDF exceeds 5 MB",
        )

    if not pdf_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=422,
            detail="Invalid PDF file",
        )

    # 生成服务器自己的文件 ID，不直接使用用户文件名
    upload_id = uuid4().hex

    upload_dir = Path(
        os.getenv("UPLOAD_DIR", "data/uploads")
    )
    upload_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = upload_dir / f"{upload_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)

    try:
        job = document_queue.enqueue(
            "ai_task_manager.document_jobs.process_pdf_job",
            upload_id,
            source_id,
            current_user.id,
            filename,
            job_timeout=600,
            result_ttl=86400,
            failure_ttl=86400,
            meta={"user_id": current_user.id},
        )

    except RedisError:
        pdf_path.unlink(missing_ok=True)
        logger.exception("Failed to enqueue PDF job")

        raise HTTPException(
            status_code=503,
            detail="Document queue is unavailable",
        )

    return {
        "job_id": job.id,
        "status": "QUEUED",
    }


@router.get("/ai/document-jobs/{job_id}")
def get_document_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        job = Job.fetch(
            job_id,
            connection=redis_connection,
            serializer=JSONSerializer,
        )

        # 只允许任务的创建者查询
        if job.meta.get("user_id") != current_user.id:
            raise HTTPException(
                status_code=404,
                detail="Job not found",
            )

        status = job.get_status(refresh=True)
        status_value = (
            status.value if hasattr(status, "value")
            else str(status)
        )

        return {
            "job_id": job.id,
            "status": status_value,
            "result": (
                job.return_value()
                if status_value == "finished"
                else None
            ),
        }

    except NoSuchJobError:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    except RedisError:
        logger.exception("Failed to fetch document job")
        raise HTTPException(
            status_code=503,
            detail="Document queue is unavailable",
        )


