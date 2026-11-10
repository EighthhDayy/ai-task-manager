from fastapi import APIRouter, Depends, HTTPException

from ai_task_manager.auth import get_current_user
from ai_task_manager.qa_service import (
    TransformerQAError,
    answer_transformer_question,
)
from ai_task_manager.schemas import TransformerAnswer, TransformerQuestion


router = APIRouter(
    prefix="/ai",
    tags=["QA(Fine-tuned Qwen3)"],
    dependencies=[Depends(get_current_user)],
)

STATUS_BY_ERROR = {
    "not_configured": 503,
    "not_found": 404,
    "timeout": 504,
    "upstream_error": 502,
}


@router.post("/Qwen3-qa", response_model=TransformerAnswer)
def ask_transformer_qa(request: TransformerQuestion) -> TransformerAnswer:
    try:
        return answer_transformer_question(request.question)
    except TransformerQAError as exc:
        raise HTTPException(
            status_code=STATUS_BY_ERROR[exc.kind],
            detail=str(exc),
        ) from exc
