
import os
import re
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup, SoupStrainer


from ai_task_manager.schemas import ModelAnswer, TransformerAnswer


WIKI_REST_URL = "https://en.wikipedia.org/w/rest.php/v1"
WIKI_HEADERS = {
    "User-Agent": "AITaskManagerQA/0.1 (https://github.com/EighthhDayy/ai-task-manager)",
}
WORD = re.compile(r"\b[a-z0-9]+\b", re.IGNORECASE | re.ASCII)
YEAR = re.compile(r"\b(?:1[0-9]{3}|20[0-9]{2})\b")
STOP_WORDS = frozenset(
    "a an and are as at be by did do does for from had has have her his how i in is it "
    "make of on or she that the their they to was were what when where which who why with".split()
)


# 去wiki找资料
def wikipedia_passage(client: httpx.Client, question: str) -> tuple[str, str] | None:
    # 先找资料，后把找到的资料排序
    terms = list(dict.fromkeys(
        word.lower() for word in WORD.findall(question) if word.lower() not in STOP_WORDS
    ))
    search_query = " ".join(terms)
    if not search_query:
        search_query = question

    search = client.get(
        f"{WIKI_REST_URL}/search/page",
        params={"q": search_query, "limit": 3},
        headers=WIKI_HEADERS,
    )
    search.raise_for_status()

    best_passage = None
    best_score = (0, False, False)
    question_words = " ".join(WORD.findall(question.lower()))
    asks_when = question.lower().lstrip().startswith("when ")
    for page in search.json()["pages"]:
        key = quote(page["key"], safe="")
        title_words = " ".join(WORD.findall(page["title"].lower()))
        names_article = bool(title_words) and f" {title_words} " in f" {question_words} "
        article = client.get(
            f"{WIKI_REST_URL}/page/{key}/html",
            headers=WIKI_HEADERS,
            follow_redirects=True,
        )
        if article.status_code == 404:
            continue
        article.raise_for_status()

        document = BeautifulSoup(article.content, "html.parser", parse_only=SoupStrainer("p"))
        for paragraph in document.find_all("p"):
            for citation in paragraph.select("sup.mw-ref, sup.reference"):
                citation.decompose()
            passage = " ".join(paragraph.get_text().split())
            if len(passage) > 1000:
                passage = passage[:1000].rsplit(" ", 1)[0]
            if len(passage) < 60:
                continue
            words = set(WORD.findall(passage.lower()))
            overlap = len(words.intersection(terms))
            score = (overlap, names_article, asks_when and bool(YEAR.search(passage)))
            if overlap > 0 and score > best_score:
                best_score = score
                best_passage = (passage, f"https://en.wikipedia.org/wiki/{key}")

    return best_passage


class TransformerQAError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def answer_transformer_question(question: str) -> TransformerAnswer:
    model_url = os.getenv("TRANSFORMER_QA_URL", "").strip().rstrip("/")
    if not model_url:
        raise TransformerQAError(
            "not_configured",
            "Transformer QA service is not configured.",
        )

    with httpx.Client(timeout=8.0) as client:
        try:
            result = wikipedia_passage(client, question)
        except httpx.TimeoutException as exc:
            raise TransformerQAError(
                "timeout",
                "Wikipedia retrieval timed out.",
            ) from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise TransformerQAError(
                "upstream_error",
                "Wikipedia retrieval failed.",
            ) from exc

        if result is None:
            raise TransformerQAError(
                "not_found",
                "No relevant Wikipedia passage was found.",
            )
        context, source_url = result
        # 把问题 question 和检索到的wiki内容交给 Qwen3，再读取返回的答案
        try:
            prediction = client.post(
                f"{model_url}/predict",
                json={"question": question, "context": context},
                timeout=httpx.Timeout(90.0, connect=5.0),
            )
            prediction.raise_for_status()
            answer = ModelAnswer.model_validate(prediction.json())
        except httpx.TimeoutException as exc:
            raise TransformerQAError(
                "timeout",
                "Qwen3 inference timed out.",
            ) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise TransformerQAError(
                "upstream_error",
                "Qwen3 inference failed.",
            ) from exc

    return TransformerAnswer(
        answer=answer.answer,
        model=answer.model,
        source_url=source_url,
    )
