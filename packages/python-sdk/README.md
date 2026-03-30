# whatagent

The easiest way to send WhatsApp messages from Python.

## Install

```bash
pip install whatagent
```

## Quick Start

```python
import os
from whatagent import WhatAgent

wa = WhatAgent(api_key=os.environ["WHATAGENT_API_KEY"])

# Send a text message
result = wa.messages.send(to="+14155552671", text="Hello from Python!")
print(result.id, result.status)

# Send a template
wa.messages.send(
    to="+14155552671",
    template={"name": "hello_world", "language": "en_US"},
)

# Send an image
wa.messages.send(
    to="+14155552671",
    image={"url": "https://example.com/photo.jpg", "caption": "Check this out!"},
)

# Check delivery status
msg = wa.messages.get(result.id)
print(msg.status, msg.delivered_at)

# List recent messages
recent = wa.messages.list(limit=20)
for m in recent.messages:
    print(m.created_at, m.direction, m.body)
```

## Get an API Key

Use the `@whatagent/mcp` MCP server (Claude Code / Cursor) to set up your account, or bootstrap directly:

```bash
curl -X POST https://api.whatagent.dev/v1/bootstrap \
  -H "Authorization: Bearer YOUR_BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"phone_number_id":"...","waba_id":"...","access_token":"EAAxx..."}'
```

## Requirements

Python 3.8+ — no external dependencies (uses the stdlib `urllib`).

## License

MIT
