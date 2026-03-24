from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.auth import (
    COOKIE_NAME,
    check_rate_limit,
    create_jwt,
    get_unlocked_groups,
    has_protected_drives,
    record_failed_attempt,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UnlockRequest(BaseModel):
    password: str
    remember: bool = False


class UnlockResponse(BaseModel):
    success: bool
    groups: list[str] = []
    error: str = ""


class LockResponse(BaseModel):
    success: bool


class StatusResponse(BaseModel):
    unlocked_groups: list[str]
    has_protected_drives: bool


@router.post("/unlock", response_model=UnlockResponse)
async def unlock(body: UnlockRequest, request: Request, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip)

    groups = verify_password(body.password)
    if groups is None:
        record_failed_attempt(client_ip)
        return UnlockResponse(success=False, error="Invalid password")

    token, max_age = create_jwt(groups, body.remember)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="strict",
        secure=False,
        path="/",
    )
    return UnlockResponse(success=True, groups=groups)


@router.post("/lock", response_model=LockResponse)
async def lock(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        samesite="strict",
        secure=False,
        path="/",
    )
    return LockResponse(success=True)


@router.get("/status", response_model=StatusResponse)
async def status(request_groups: Annotated[list[str], Depends(get_unlocked_groups)]):
    return StatusResponse(
        unlocked_groups=request_groups,
        has_protected_drives=has_protected_drives(),
    )
