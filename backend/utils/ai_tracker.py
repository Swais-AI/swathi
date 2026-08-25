import logging
import os
from typing import Any, Mapping

import psycopg
from psycopg_pool import PoolTimeout

from database import database_connection


logger = logging.getLogger(__name__)


def extract_token_usage(response: Mapping[str, Any] | None) -> tuple[int, int, int]:
    """Return prompt, completion, and total tokens from Gemini or OpenAI-style responses."""
    if not response:
        return 0, 0, 0

    usage = response.get("usageMetadata") or response.get("usage_metadata") or response.get("usage") or {}
    prompt_tokens = int(
        usage.get("promptTokenCount")
        or usage.get("prompt_tokens")
        or usage.get("input_tokens")
        or 0
    )
    completion_tokens = int(
        usage.get("candidatesTokenCount")
        or usage.get("completion_tokens")
        or usage.get("output_tokens")
        or 0
    )
    total_tokens = int(
        usage.get("totalTokenCount")
        or usage.get("total_tokens")
        or (prompt_tokens + completion_tokens)
    )
    return prompt_tokens, completion_tokens, total_tokens


def log_ai_usage(
    *,
    module_name: str,
    feature_used: str,
    user_email: str | None = None,
    response: Mapping[str, Any] | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
) -> bool:
    """Write one AI usage row without allowing analytics failures to break the feature."""
    if not (os.getenv("DATABASE_URL") or "").strip():
        logger.warning("AI usage was not logged because DATABASE_URL is not configured.")
        return False

    extracted_prompt, extracted_completion, extracted_total = extract_token_usage(response)
    prompt_count = max(0, int(prompt_tokens if prompt_tokens is not None else extracted_prompt))
    completion_count = max(
        0,
        int(completion_tokens if completion_tokens is not None else extracted_completion),
    )
    total_count = max(
        0,
        int(total_tokens if total_tokens is not None else extracted_total or prompt_count + completion_count),
    )

    try:
        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO ai_usage_logs (
                        client_name,
                        user_email,
                        module_name,
                        feature_used,
                        prompt_tokens,
                        completion_tokens,
                        total_tokens
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        (os.getenv("CLIENT_NAME") or "SGS").strip() or "SGS",
                        (user_email or "").strip() or None,
                        module_name.strip(),
                        feature_used.strip(),
                        prompt_count,
                        completion_count,
                        total_count,
                    ),
                )
            connection.commit()
        return True
    except (psycopg.Error, PoolTimeout, ValueError, TypeError) as error:
        logger.warning("Unable to write ai_usage_logs: %s", error)
        return False
