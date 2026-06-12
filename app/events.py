import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any


Event = dict[str, Any]


@dataclass
class EventBroker:
    subscribers: set[asyncio.Queue[Event]] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[Event]]:
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=100)
        async with self.lock:
            self.subscribers.add(queue)
        try:
            yield queue
        finally:
            async with self.lock:
                self.subscribers.discard(queue)

    async def publish(self, event_type: str, **payload: Any) -> None:
        event = {"type": event_type, **payload}
        async with self.lock:
            subscribers = tuple(self.subscribers)

        for queue in subscribers:
            publish_nowait(queue, event)


def format_sse(event: Event) -> str:
    data = json.dumps(event, ensure_ascii=False)
    return f"event: archive\ndata: {data}\n\n"


def publish_nowait(queue: asyncio.Queue[Event], event: Event) -> None:
    try:
        queue.put_nowait(event)
        return
    except asyncio.QueueFull:
        pass

    try:
        queue.get_nowait()
    except asyncio.QueueEmpty:
        pass

    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        pass
