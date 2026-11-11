"""Diagnostic run of the Ask pipeline that also dumps the context snippets.

Runs in a separate process inside the intelligence container, against the
code baked into the image. Wraps assemble_contexts only to observe its output;
nothing is changed or written.  Usage: python probe.py <drive> <query>
"""
import asyncio
import json
import sys

import app.rag.service as service
from app import llm_routing
from app.credentials import CallerCredential

drive, query = sys.argv[1], sys.argv[2]
real = service.assemble_contexts
dump = []


def wrapped(*a, **k):
    contexts = real(*a, **k)
    for fc in contexts:
        for s in fc.snippets:
            dump.append({
                "file_id": fc.file_id if hasattr(fc, "file_id") else None,
                "source": s.source,
                "location": s.location,
                "anchor": s.anchor,
                "len": len(s.text),
                "before_anchor_head": s.text[:60],
                "at_anchor_head": s.text[s.anchor:s.anchor + 60],
            })
    return contexts


service.assemble_contexts = wrapped


async def main():
    from app.database import init_litloft_db, init_search_db
    init_search_db()
    init_litloft_db()
    resolved = await llm_routing.resolve(drive, "rag")
    cites = None
    async for ev in service.stream_answer(
        query=query, credential=CallerCredential(), top_k=None, file_type=None,
        drive=drive, viewer_id=None, resolved=resolved,
    ):
        if ev.kind == "citations":
            cites = ev.data["citations"]
    print(json.dumps({"snippets": dump, "citations": cites}, ensure_ascii=False, indent=1))


asyncio.run(main())
