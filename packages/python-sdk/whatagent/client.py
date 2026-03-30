"""WhatAgent Python client."""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Dict, Optional, Union

from .errors import WhatAgentError
from .types import ListMessagesResult, Message, SendResult

DEFAULT_BASE_URL = "https://api.whatagent.dev"
DEFAULT_TIMEOUT = 30


def _request(
    api_key: str,
    base_url: str,
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Any:
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "whatagent-python/1.0.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            error_body = json.loads(exc.read().decode("utf-8"))
        except Exception:
            error_body = None
        raise WhatAgentError.from_response(exc.code, error_body) from exc


class Messages:
    """Send and retrieve WhatsApp messages."""

    def __init__(self, api_key: str, base_url: str, timeout: int) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._timeout = timeout

    def send(
        self,
        *,
        to: str,
        text: Optional[str] = None,
        template: Optional[Dict[str, Any]] = None,
        image: Optional[Dict[str, Any]] = None,
        preview_url: Optional[bool] = None,
    ) -> SendResult:
        """Send a WhatsApp message.

        Exactly one of ``text``, ``template``, or ``image`` must be provided.

        Examples::

            # Text message
            wa.messages.send(to="+14155552671", text="Hello!")

            # Template message
            wa.messages.send(
                to="+14155552671",
                template={"name": "hello_world", "language": "en_US"},
            )

            # Image message
            wa.messages.send(
                to="+14155552671",
                image={"url": "https://example.com/photo.jpg", "caption": "Check this out!"},
            )
        """
        if text is not None:
            body: Dict[str, Any] = {"type": "text", "to": to, "text": text}
            if preview_url is not None:
                body["preview_url"] = preview_url
        elif template is not None:
            body = {"type": "template", "to": to, "template": template}
        elif image is not None:
            body = {"type": "image", "to": to, "image": image}
        else:
            raise ValueError("One of text, template, or image must be provided")

        data = _request(self._api_key, self._base_url, "POST", "/v1/messages", body, self._timeout)
        return SendResult.from_dict(data)

    def get(self, message_id: str) -> Message:
        """Get a single message by ID."""
        data = _request(
            self._api_key, self._base_url, "GET", f"/v1/messages/{message_id}", timeout=self._timeout
        )
        return Message.from_dict(data)

    def list(self, limit: int = 10, after: Optional[str] = None) -> ListMessagesResult:
        """List recent messages (newest first)."""
        params = f"?limit={limit}"
        if after:
            params += f"&after={after}"
        data = _request(
            self._api_key, self._base_url, "GET", f"/v1/messages{params}", timeout=self._timeout
        )
        return ListMessagesResult.from_dict(data)


class WhatAgent:
    """WhatAgent client — the easiest way to send WhatsApp messages from Python.

    Args:
        api_key: Your WhatAgent API key (starts with ``wha_``).
            Defaults to the ``WHATAGENT_API_KEY`` environment variable.
        base_url: Override the API base URL. Defaults to ``https://api.whatagent.dev``.
        timeout: Request timeout in seconds. Defaults to 30.

    Example::

        import os
        from whatagent import WhatAgent

        wa = WhatAgent(api_key=os.environ["WHATAGENT_API_KEY"])
        result = wa.messages.send(to="+14155552671", text="Hello from Python!")
        print(result.id, result.status)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        import os

        resolved_key = api_key or os.environ.get("WHATAGENT_API_KEY")
        if not resolved_key:
            raise ValueError(
                "WhatAgent: api_key is required. Pass it directly or set the "
                "WHATAGENT_API_KEY environment variable."
            )
        if not resolved_key.startswith("wha_"):
            raise ValueError("WhatAgent: api_key must start with wha_")

        self._api_key = resolved_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

        #: Send and retrieve messages
        self.messages = Messages(self._api_key, self._base_url, self._timeout)
