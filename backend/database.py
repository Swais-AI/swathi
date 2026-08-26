import os
from contextlib import contextmanager
from threading import Lock

from psycopg_pool import ConnectionPool


_pool: ConnectionPool | None = None
_pool_lock = Lock()


def get_database_url() -> str:
    database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured for the FastAPI backend.")
    return database_url


def get_database_pool() -> ConnectionPool:
    global _pool

    if _pool is None:
        with _pool_lock:
            if _pool is None:
                pool = ConnectionPool(
                    conninfo=get_database_url(),
                    min_size=1,
                    max_size=5,
                    timeout=10,
                    max_idle=300,
                    name="sgs-student-dashboard",
                    open=False,
                )
                pool.open(wait=True)
                _pool = pool

    return _pool


@contextmanager
def database_connection():
    with get_database_pool().connection() as connection:
        yield connection


def close_database_pool() -> None:
    global _pool

    if _pool is not None:
        _pool.close()
        _pool = None
