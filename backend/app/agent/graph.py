from collections.abc import Callable
from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph


AI_REVIEW_GRAPH_NODES = [
    "load_context",
    "build_prompt",
    "call_model",
    "validate_output",
    "retry_or_fail",
    "decide_transition",
    "persist_review",
    "mark_needs_human_review",
]


class AIReviewState(TypedDict, total=False):
    submission_id: str
    idempotency_key: str
    retry_count: int
    max_retries: int
    context: dict[str, Any]
    prompt_snapshot: str
    raw_response: object
    result: object
    error: str
    failure_reason: str
    transition_action: object
    review_id: str
    final_status: str


def _call_model_route(state: AIReviewState) -> Literal["validate_output", "retry_or_fail"]:
    return "retry_or_fail" if state.get("error") else "validate_output"


def _validate_route(state: AIReviewState) -> Literal["decide_transition", "retry_or_fail"]:
    return "retry_or_fail" if state.get("error") else "decide_transition"


def _retry_route(state: AIReviewState) -> Literal["call_model", "mark_needs_human_review"]:
    return "call_model" if state.get("final_status") == "retrying" else "mark_needs_human_review"


def build_review_graph(nodes: dict[str, Callable[[AIReviewState], AIReviewState]]):
    graph = StateGraph(AIReviewState)
    for node_name in AI_REVIEW_GRAPH_NODES:
        graph.add_node(node_name, nodes[node_name])

    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "build_prompt")
    graph.add_edge("build_prompt", "call_model")
    graph.add_conditional_edges(
        "call_model",
        _call_model_route,
        {"validate_output": "validate_output", "retry_or_fail": "retry_or_fail"},
    )
    graph.add_conditional_edges(
        "validate_output",
        _validate_route,
        {"decide_transition": "decide_transition", "retry_or_fail": "retry_or_fail"},
    )
    graph.add_conditional_edges(
        "retry_or_fail",
        _retry_route,
        {
            "call_model": "call_model",
            "mark_needs_human_review": "mark_needs_human_review",
        },
    )
    graph.add_edge("decide_transition", "persist_review")
    graph.add_edge("persist_review", END)
    graph.add_edge("mark_needs_human_review", END)
    return graph.compile()
