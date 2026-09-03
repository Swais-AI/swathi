from contextlib import asynccontextmanager

from psycopg_pool import AsyncConnectionPool

from pool_psycopg import build_pool
from settings import get_settings


SERVICE_NAME = "sgs-student-api"
_pool: AsyncConnectionPool | None = None


async def open_database_pool() -> AsyncConnectionPool:
    global _pool

    if _pool is None:
        settings = get_settings()
        _pool = build_pool(
            url=settings.database_url,
            service=SERVICE_NAME,
            slots=settings.db_service_slots,
            reserve=settings.db_pool_reserve,
        )
        await _pool.open(wait=True)

    return _pool


def get_database_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("Database pool has not been opened during application startup.")
    return _pool


@asynccontextmanager
async def database_connection():
    async with get_database_pool().connection() as connection:
        yield connection


async def close_database_pool() -> None:
    global _pool

    if _pool is not None:
        await _pool.close()
        _pool = None
