# ingestion  名词，意思是：摄入、吸收、导入。
# 可以理解为“把外部数据导入系统，并进行处理”

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ai_task_manager.chunking import smart_chunk_document
from ai_task_manager.llm import client
from ai_task_manager.models import DocumentChunk

# index_document: 把新文档转为 Chunk 和 Embedding，并写入数据库
def index_document(
    source_id: str,
    text: str,
    user_id: int,
    db: Session,
) -> dict:
    # 1. 检查用户输入的source_id和text
    source_id = source_id.strip()            # 去掉字符串开头和结尾的空白字符，但不会删除中间的空白
    text = text.strip()

    if not source_id or not text:
        raise ValueError("source_id and text cannot be empty")
    # 2.切块
    # 先把用户输入的数据转换成函数接受的形式:dict
    document = {
        "id": source_id,
        "text": text,
    }
    chunks = smart_chunk_document(
        document=document,
        chunk_size=500,
        chunk_overlap=80
    )
    # 如果没有chunk
    if not chunks:
        raise ValueError("Document produced no chunks")

    # 3.一次请求，批量生成全部 Chunk 的 Embedding
    texts = []
    for chunk in chunks:
        texts.append(chunk["text"])
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

    for i, (chunk,vector) in enumerate(
        zip(chunks,embeddings),
        start = 1
    ):
        records.append(
            DocumentChunk(
                id = f"user-{user_id}:{source_id}:{i}",     # 即使两个用户都上传名为 holiday-policy 的文档，Chunk 主键也不会发生冲突
                source_id=source_id,
                owner_id=user_id,
                text=chunk["text"],
                embedding=vector,
            )
        )
    # for遍历的内容
    # [
    #     (1, ({"text": "Apple"}, [0.1, 0.2])),
    #     (2, ({"text": "Banana"}, [0.3, 0.4])),
    #     (3, ({"text": "Coffee"}, [0.5, 0.6])),
    # ]

    # 7. 在同一个数据库事务中替换旧 Chunk
    try:
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
