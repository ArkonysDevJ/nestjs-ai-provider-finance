"""
finance-classifier-mcp — a small, deliberately boring MCP server. One
tool, classify_transaction, that takes a transaction and returns a
category name. No personality, no flourishes -- an LLM with a strong
persona tends to produce messier, less predictable JSON/text output,
and this server's only job is a clean one-word answer.

Real MCP server (streamable-http, not a REST mock) backed by local
Ollama. Standalone and self-contained: no shared code or runtime with
any other local tooling. It exists solely to back AI_PROVIDER=local
for this portfolio project (nestjs-ai-provider-finance).

Usage:
    pip install -r requirements.txt
    python server.py
    # serves at http://0.0.0.0:8765/mcp (streamable-http)

Optional environment variables:
    OLLAMA_BASE_URL  (default: http://localhost:11434)
    OLLAMA_MODEL     (default: qwen2.5:3b)
    MCP_HOST         (default: 0.0.0.0)
    MCP_PORT         (default: 8765)
"""

import os
from typing import Annotated

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import Field

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
MCP_HOST = os.environ.get("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.environ.get("MCP_PORT", "8765"))

# Closed catalog, split by transaction type -- must mirror
# EXPENSE_CATEGORY_NAMES / INCOME_CATEGORY_NAMES in
# apps/api/src/ai/ai-provider.interface.ts exactly. If one changes, so
# does the other. No shared single source of truth between Python and
# TypeScript by design -- these are two separate, decoupled projects.
# "Otros" is the universal fallback and appears in both lists.
EXPENSE_CATEGORIES = [
    "Alimentación",
    "Transporte",
    "Vivienda",
    "Salud",
    "Entretenimiento",
    "Educación",
    "Ahorro/Inversión",
    "Otros",
]

INCOME_CATEGORIES = [
    "Salario",
    "Ingreso extra",
    "Reembolso",
    "Otros",
]


def categories_for_type(transaction_type: str) -> list[str]:
    return INCOME_CATEGORIES if transaction_type == "income" else EXPENSE_CATEGORIES

mcp = FastMCP("finance-classifier", host=MCP_HOST, port=MCP_PORT)


@mcp.tool()
def classify_transaction(
    description: Annotated[
        str, Field(description="Description of the financial transaction to classify.")
    ],
    amount: Annotated[float, Field(description="Transaction amount.")],
    type: Annotated[str, Field(description="'income' or 'expense'.")],
) -> str:
    """
    Classifies a financial transaction into EXACTLY one category from
    the list that matches its type: EXPENSE_CATEGORIES for an expense
    (Alimentación, Transporte, Vivienda, Salud, Entretenimiento,
    Educación, Ahorro/Inversión, Otros) or INCOME_CATEGORIES for
    income (Salario, Ingreso extra, Reembolso, Otros).

    Returns only the exact category name, no explanation. If uncertain,
    return "Otros" -- never invent a category outside the list.
    """
    normalized_type = "income" if type == "income" else "expense"
    categories = categories_for_type(normalized_type)
    prompt = (
        "Classify the following financial transaction into EXACTLY one "
        f"of these categories: {', '.join(categories)}\n\n"
        f"Description: {description}\n"
        f"Amount: {amount}\n"
        f"Type: {normalized_type}\n\n"
        "Respond ONLY with the exact category name, no additional "
        "explanation."
    )

    # No silent try/except here: if Ollama fails, the error propagates
    # as-is and the MCP client (LocalProvider in NestJS) receives it as
    # a failed tool call. The decision to fall back to "Otros" lives on
    # the client side (see FALLBACK_CATEGORY in ai-provider.interface.ts)
    # -- same pattern as GeminiProvider. This server doesn't decide, it
    # only reports.
    response = httpx.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            # num_ctx kept low on purpose: classifying a transaction
            # doesn't need the model's native context window (Qwen2.5
            # supports up to 32k). Without this cap, the KV-cache
            # reserved in VRAM grows with context -- on a GTX 1650 (4GB)
            # that was the difference between loading cleanly and
            # "cudaMalloc failed: out of memory" (confirmed 2026-07-29).
            "options": {"num_ctx": 2048},
        },
        timeout=30,
    )
    if response.is_error:
        # raise_for_status() alone only gives the status code (500)
        # without the body -- Ollama's response body carries the real
        # reason (model not loaded, VRAM OOM, etc.). Without this, every
        # failure looks identical from NestJS's side.
        raise RuntimeError(
            f"Ollama responded {response.status_code}: {response.text}"
        )
    content = response.json().get("message", {}).get("content", "")
    return content.strip()


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
