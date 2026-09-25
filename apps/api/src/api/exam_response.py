"""FileResponse protocol handling with ownership of an already scanned file.

The path is never opened again. Keep the framework's Range/If-Range parser and
headers, replacing only its file I/O; protocol regression tests guard upgrades.
"""
import os
from secrets import token_hex

import anyio
from starlette.datastructures import MutableHeaders
from starlette.responses import FileResponse


class OpenExamResponse(FileResponse):
    def __init__(self, stream, filename):
        self.stream = stream
        super().__init__(path="", filename=filename, stat_result=os.fstat(stream.fileno()),
            media_type="application/octet-stream", headers={
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "Cache-Control": "no-store"})

    async def __call__(self, scope, receive, send):
        try:
            async with anyio.create_task_group() as group:
                async def respond():
                    await super(OpenExamResponse, self).__call__(scope, receive, send)
                    group.cancel_scope.cancel()

                async def disconnected():
                    while True:
                        if (await receive())["type"] == "http.disconnect":
                            group.cancel_scope.cancel()
                            return

                group.start_soon(respond)
                await disconnected()
        finally:
            # Thread reads are shielded by anyio; none remain active at close.
            self.stream.close()

    async def _bytes(self, send, start, end, *, final):
        await anyio.to_thread.run_sync(self.stream.seek, start)
        remaining = end - start
        while remaining:
            chunk = await anyio.to_thread.run_sync(self.stream.read, min(self.chunk_size, remaining))
            if not chunk:
                raise OSError("Exam stream ended before its declared length")
            remaining -= len(chunk)
            await send({"type": "http.response.body", "body": chunk, "more_body": bool(remaining) or not final})
        if start == end and final:
            await send({"type": "http.response.body", "body": b"", "more_body": False})

    async def _handle_simple(self, send, send_header_only, send_pathsend):
        # Never use pathsend: it would reopen a pathname after cleanup.
        await send({"type": "http.response.start", "status": self.status_code, "headers": self.raw_headers})
        if send_header_only:
            await send({"type": "http.response.body", "body": b"", "more_body": False})
        else:
            await self._bytes(send, 0, self.stat_result.st_size, final=True)

    async def _handle_single_range(self, send, start, end, file_size, send_header_only):
        headers = MutableHeaders(raw=list(self.raw_headers))
        headers["content-range"] = f"bytes {start}-{end - 1}/{file_size}"
        headers["content-length"] = str(end - start)
        await send({"type": "http.response.start", "status": 206, "headers": headers.raw})
        if send_header_only:
            await send({"type": "http.response.body", "body": b"", "more_body": False})
        else:
            await self._bytes(send, start, end, final=True)

    async def _handle_multiple_ranges(self, send, ranges, file_size, send_header_only):
        boundary = token_hex(13)
        length, header = self.generate_multipart(ranges, boundary, file_size, self.media_type)
        headers = MutableHeaders(raw=list(self.raw_headers))
        headers["content-type"] = f"multipart/byteranges; boundary={boundary}"
        headers["content-length"] = str(length)
        await send({"type": "http.response.start", "status": 206, "headers": headers.raw})
        if send_header_only:
            await send({"type": "http.response.body", "body": b"", "more_body": False})
        else:
            for start, end in ranges:
                await send({"type": "http.response.body", "body": header(start, end), "more_body": True})
                await self._bytes(send, start, end, final=False)
                await send({"type": "http.response.body", "body": b"\r\n", "more_body": True})
            await send({"type": "http.response.body", "body": f"--{boundary}--".encode(), "more_body": False})
