import asyncio
from contextlib import asynccontextmanager


class MaintenanceBusyError(RuntimeError):
    pass


_lock = asyncio.Lock()
_operation: str | None = None


def current_operation() -> str | None:
    return _operation


def is_busy() -> bool:
    return _lock.locked()


@asynccontextmanager
async def maintenance_operation(operation: str):
    global _operation
    if _lock.locked():
        raise MaintenanceBusyError(
            f"Maintenance operation already running: {_operation or 'unknown'}"
        )
    async with _lock:
        _operation = operation
        try:
            yield
        finally:
            _operation = None
