"""일관된 오류 응답: {"error": {"code": ..., "message": ..., "fields": [...]}}"""
from typing import Optional


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: Optional[list[dict]] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or []


def not_found(what: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what}을(를) 찾을 수 없습니다.")
