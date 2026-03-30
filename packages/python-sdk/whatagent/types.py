"""Type definitions for the WhatAgent Python SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

MessageStatus = Literal["queued", "sent", "delivered", "read", "failed"]
MessageType = Literal["text", "template", "image"]
MessageDirection = Literal["outbound", "inbound"]


@dataclass
class Message:
    """A WhatsApp message record."""

    id: str
    direction: MessageDirection
    to_number: Optional[str]
    from_number: Optional[str]
    type: MessageType
    body: Optional[str]
    template_name: Optional[str]
    meta_message_id: Optional[str]
    status: MessageStatus
    error_message: Optional[str]
    sent_at: Optional[str]
    delivered_at: Optional[str]
    read_at: Optional[str]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict) -> "Message":
        return cls(
            id=d["id"],
            direction=d.get("direction", "outbound"),
            to_number=d.get("to_number"),
            from_number=d.get("from_number"),
            type=d.get("type", "text"),
            body=d.get("body"),
            template_name=d.get("template_name"),
            meta_message_id=d.get("meta_message_id"),
            status=d.get("status", "queued"),
            error_message=d.get("error_message"),
            sent_at=d.get("sent_at"),
            delivered_at=d.get("delivered_at"),
            read_at=d.get("read_at"),
            created_at=d["created_at"],
        )


@dataclass
class SendResult:
    """Result of a send operation."""

    id: str
    status: MessageStatus
    to: str
    meta_message_id: str

    @classmethod
    def from_dict(cls, d: dict) -> "SendResult":
        return cls(
            id=d["id"],
            status=d["status"],
            to=d["to"],
            meta_message_id=d["meta_message_id"],
        )


@dataclass
class ListMessagesResult:
    """Result of listing messages."""

    messages: List[Message]
    count: int

    @classmethod
    def from_dict(cls, d: dict) -> "ListMessagesResult":
        return cls(
            messages=[Message.from_dict(m) for m in d.get("messages", [])],
            count=d.get("count", 0),
        )
