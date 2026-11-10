from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from ai_task_manager.models import DocumentChunk
from ai_task_manager.llm import client


def get_embedding(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )

    vector = response.data[0].embedding

    return vector



def db_semantic_retrieve(question:str, db: Session, user_id: int, top_k:int = 2):
    # 1. 那用户的question变成vector
    query_vector = get_embedding(question)
    # 2. 构造余弦距离表达式
    # 从类名开始写，是因为这里不是在取“某一条 DocumentChunk 记录的 embedding 值”，
    # 而是在构造一条 SQL 查询表达式
    # DocumentChunk.embedding: 数据库表的 embedding 这一列
    # .cosine_distance(query_vector):计算数据库中这一列的每个 embedding，和 query_vector 之间的余弦距离
    distance = DocumentChunk.embedding.cosine_distance(
        query_vector
    ).label("distance")  # 给这个计算结果取名字,是SQL 查询结果里的列名
    # 3.构造 SQL
    # 每每行返回 chunk_id、source_id、text、distance （数据库计算出的距离）四个值。
    stmt = (select(DocumentChunk.id, DocumentChunk.source_id, DocumentChunk.text, distance)
        .where(
        or_(
            DocumentChunk.owner_id == user_id,          # WHERE owner_id = 当前用户ID OR owner_id IS NULL
            DocumentChunk.owner_id.is_(None),
        )
        )
    .order_by(distance)
    .limit(top_k)
    )

    # 4.数据库执行
    rows = db.execute(stmt).all()  # 同时取距离，所以改用 execute()
    # 5.转换为字典式检索结果格式
    results = []
    for chunk_id, source_id, text, dist in rows:
        results.append({
            "id": chunk_id,
            "source_id": source_id,
            "text": text,
            "distance": float(dist),
            "score": 1 - float(dist),
        })

    return results


# answer_with_rag: 从数据库查找相关 Chunk，并生成答案
def answer_with_rag(question: str, db: Session, user_id: int) -> dict:
    # 1.得到语义检索结果：包含多个字典的列表
    retrieve_docs = db_semantic_retrieve(question=question, db=db, user_id=user_id, top_k=2)
    # 2.如果检索结果是空的

    # 3.有文档，把这些字典变成一段可以交给 LLM 阅读的字符串
    # {'id': 'backup-policy', 'text': 'Database backup runs every Friday at 4 PM.', 'score': 2}
    filtered_docs = []
    for doc in retrieve_docs:
        if doc["score"] >= 0.30:
            filtered_docs.append(doc)

    if not filtered_docs:
        return {
            "answer": "Can't determine the answer from the documents.",
            "retrieved_chunk_ids": [],
        }



    retrieve_docs = filtered_docs

    # "".join()：用前面的“分隔符”，把后面列表里的多个字符串连接成一个大字符串。
    texts = []

    for doc in retrieve_docs:
        texts.append(
            f"[Chunk: {doc['id']}; Source: {doc['source_id']}]\n"
            f"{doc['text']}"
        )

    context = "\n\n".join(texts)

    # 4.调用 client.responses.create()
    # 准备发给llm的inout，把context和question放一起
    llm_input = (f"Reference documents:\n{context}\n\n"
            f"Question:\n{question}"
    )

    response = client.responses.create(
        model="gpt-5.6-luna",
        instructions=(
            "Answer using only the provided context. "
            "If the context does not support an answer, say you don't know. "
            "Cite the exact Chunk ID and Source ID supporting your answer."
        ),
        input=llm_input,
    )
    # 5. 返回lmm回复结果
    return {
        "answer": response.output_text,
        "retrieved_chunk_ids": [
            doc["id"] for doc in filtered_docs
        ],
    }
