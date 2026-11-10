# ingestion  名词，意思是：摄入、吸收、导入。
# 可以理解为“把外部数据导入系统，并进行处理”

from collections.abc import Iterable

from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ai_task_manager.chunking import smart_chunk_document
from ai_task_manager.llm import client
from ai_task_manager.models import Document, DocumentChunk
from ai_task_manager.pdf_utils import extract_pdf_pages

# index_document: 把新文档转为 Chunk 和 Embedding，并写入数据库
def index_document(
    source_id: str,
    text: str,
    user_id: int,
    db: Session,
    *,
    filename: str | None = None,
) -> dict:
    return _index_sections(source_id, [(None, text)], user_id, db, filename=filename)


def index_pdf_document(
    source_id: str,
    pdf_bytes: bytes,
    user_id: int,
    db: Session,
    *,
    filename: str | None = None,
) -> dict:
    return _index_sections(
        source_id, extract_pdf_pages(pdf_bytes), user_id, db, filename=filename
    )


def _index_sections(
    source_id: str,
    sections: Iterable[tuple[int | None, str]],
    user_id: int,
    db: Session,
    *,
    filename: str | None,
) -> dict:
    source_id = source_id.strip()
    if not source_id:
        raise ValueError("source_id and text cannot be empty")

    chunks: list[tuple[int | None, str]] = []
    for page_number, text in sections:
        for chunk in smart_chunk_document(
            document={"id": source_id, "text": text.strip()},
            chunk_size=500,
            chunk_overlap=80,
        ):
            if chunk["text"].strip():
                chunks.append((page_number, chunk["text"]))

    if not chunks:
        raise ValueError("source_id and text cannot be empty")

    # 3.一次请求，批量生成全部 Chunk 的 Embedding
    texts = [text for _, text in chunks]
    # 调用open ai 的Embedding API
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )

    # 4. 按照 index 排序 API 返回的数据
    # 之所以排序。因为chunks[0] # Apple  embeddings[0]  # Apple 的向量  要对应
    sorted_items = sorted(
    response.data,
    key=lambda item: item.index
    )
    # 5.提取每个 item 里面的 embedding
    embeddings = []

    for item in sorted_items:
        embeddings.append(item.embedding)
    # 6.构建待保存到数据库里的 ORM 对象

    if len(embeddings) != len(chunks):
        raise RuntimeError("Embedding count mismatch")
    
    records = []

    for i, ((page_number, chunk_text), vector) in enumerate(
        zip(chunks,embeddings),
        start = 1
    ):
        records.append(
            DocumentChunk(
                id = f"user-{user_id}:{source_id}:{i}",     # 即使两个用户都上传名为 holiday-policy 的文档，Chunk 主键也不会发生冲突
                source_id=source_id,
                owner_id=user_id,
                text=chunk_text,
                page_number=page_number,
                embedding=vector,
            )
        )
    # for遍历的内容
    # [
    #     (1, ({"text": "Apple"}, [0.1, 0.2])),
    #     (2, ({"text": "Banana"}, [0.3, 0.4])),
    #     (3, ({"text": "Coffee"}, [0.5, 0.6])),
    # ]

    # 7. 在同一个数据库事务中保存元数据并替换旧 Chunk
    try:
        document_insert = insert(Document).values(
            owner_id=user_id,
            source_id=source_id,
            filename=filename,
            indexed_at=func.statement_timestamp(),
        )
        # Lock the document first so reindexing and deletion serialize on the same row.
        db.execute(document_insert.on_conflict_do_update(
            constraint="uq_documents_owner_source",
            set_={
                "filename": document_insert.excluded.filename,
                "indexed_at": document_insert.excluded.indexed_at,
            },
        ))

        stmt = delete(DocumentChunk).where(
            DocumentChunk.owner_id==user_id,
            DocumentChunk.source_id==source_id      # 重新索引时，只能替换当前用户自己的同名文档，不会删除其他用户的 Chunk，也不会删除之前的共享 company-guide
        )

        db.execute(stmt)
        db.add_all(records)
        db.commit()
    except Exception:
        db.rollback()       # 如果插入时发生数据库错误,那么本次事务里已经执行的删除也会回滚
        raise

    return {
        "source_id":source_id,
        "chunk_count":len(records)
    }
