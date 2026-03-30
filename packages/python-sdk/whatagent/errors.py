"""WhatAgent error types."""

from __future__ import annotations

from typing import Optional


class WhatAgentError(Exception):
    """Raised when the WhatAgent API returns an error."""

    def __init__(self, message: str, status: int, code: Optional[str] = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code

    @classmethod
    def from_response(cls, status: int, body: object) -> "WhatAgentError":
        if isinstance(body, dict) and "error" in body:
            return cls(
                message=str(body["error"]),
                status=status,
                code=str(body["code"]) if "code" in body else None,
            )
        return cls(message=f"HTTP {status}", status=status)

    def __repr__(self) -> str:
        return f"WhatAgentError(status={self.status}, message={str(self)!r})"
