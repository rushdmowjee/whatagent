"""
WhatAgent — the easiest way to send WhatsApp messages from Python.

Quick start:
    from whatagent import WhatAgent

    wa = WhatAgent(api_key="wha_...")
    wa.messages.send(to="+14155552671", text="Hello from WhatAgent!")
"""

from .client import WhatAgent
from .errors import WhatAgentError
from .types import (
    Message,
    MessageStatus,
    MessageType,
    MessageDirection,
    SendResult,
    ListMessagesResult,
)

__all__ = [
    "WhatAgent",
    "WhatAgentError",
    "Message",
    "MessageStatus",
    "MessageType",
    "MessageDirection",
    "SendResult",
    "ListMessagesResult",
]

__version__ = "1.0.0"
