from app.agent.providers import JSONReviewModel
from app.domain.enums import AIReviewDecision


class FakeChatModel:
    def __init__(self, content: str) -> None:
        self.content = content

    def invoke(self, _prompt: str) -> object:
        return type("Message", (), {"content": self.content})()


def test_json_review_model_parses_deepseek_json_object_response() -> None:
    model = JSONReviewModel(
        FakeChatModel(
            """
            ```json
            {
              "decision": "pass",
              "overall_score": 91,
              "criterion_scores": [
                {"key": "accuracy", "score": 5, "reason": "Correct sentiment."}
              ],
              "summary": "The annotation is accurate.",
              "return_reasons": [],
              "suggestions": []
            }
            ```
            """
        )
    )

    result = model.invoke("review")

    assert result.decision == AIReviewDecision.PASS
    assert result.overall_score == 91
