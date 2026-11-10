


def chunk_text(
        text:str,
        chunk_size:int,
        chunk_overlap:int,
) -> list[str]:

    # 1. 参数验证
    if chunk_size <= 0 or not (0 <= chunk_overlap < chunk_size):
        raise ValueError("Invalid chunk_size or chunk_overlap")

    # 2.只要 Chunk 的起点还在文本范围内，就可以继续切片。
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start: end]
        chunks.append(chunk)

        # 3. 如果已经处理到文本末尾，就停止
        if end >= len(text):
            break
        # 4.下一个chunk的起点和终点
        start += (chunk_size - chunk_overlap)



    return chunks



def chunk_to_document(
        document:dict,
        chunk_size:int,
        chunk_overlap:int,
) -> list[dict]:

    text = document["text"]
    chunked_texts = chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    chunked_documents = []

    for index, piece in enumerate(chunked_texts, start=1):

        chunk_id = f"{document['id']}:{index}"
        chunked_documents.append(
            {
                "id": chunk_id,
                "source_id": document["id"],
                "text": piece,
            }
        )

    return chunked_documents




def smart_chunk_document(
    document: dict,
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict]:
    # 1.先把text里的长内容按\n\n分割成paragraphs
    text = document["text"]
    paragraphs = text.split("\n\n")
    # 2.对paragraphs里的paragraph，比较其与chunk_size的长度，决定是否要进一步分割
    pieces = []
    for paragraph in paragraphs:
        if len(paragraph) <= chunk_size:
            pieces.append(paragraph)
        else:
            sub_chunks = chunk_text(paragraph, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            pieces.extend(sub_chunks)

    # 3.建立包含id，source_id和text的字典
    chunked_documents = []

    for index, piece in enumerate(pieces, start=1):
        chunk_id = f"{document['id']}:{index}"

        chunked_documents.append({
            "id": chunk_id,
            "source_id": document["id"],
            "text": piece,
        })

    return chunked_documents
