"""Local clamd only: no file names, patient data or contents in logs/errors."""
import socket
import struct
import time
from threading import BoundedSemaphore
from datetime import datetime, timezone

from src.core.domain.exceptions import ValidationError, ServiceUnavailableError

_scan_slots = BoundedSemaphore(2)


class ClamAVScanner:
    def __init__(self, host="clamav", port=3310, timeout=40, max_age_days=7):
        self.host, self.port = host, port
        self.timeout, self.max_age_days = timeout, max_age_days

    def _reply(self, connection, deadline):
        result = b""
        while not result.endswith(b"\0") and len(result) < 4096:
            if time.monotonic() >= deadline:
                raise TimeoutError()
            connection.settimeout(max(0.01, deadline - time.monotonic()))
            chunk = connection.recv(1024)
            if not chunk:
                raise OSError("Incomplete antivirus response")
            result += chunk
        if not result.endswith(b"\0"):
            raise OSError("Invalid antivirus response")
        return result[:-1].decode("ascii", errors="replace")

    def scan(self, stream):
        if not _scan_slots.acquire(blocking=False):
            raise ServiceUnavailableError("Verificação de exames ocupada. Tente novamente em alguns segundos.")
        try:
            self._scan(stream)
        finally:
            _scan_slots.release()

    def _scan(self, stream):
        deadline = time.monotonic() + self.timeout
        try:
            with socket.create_connection((self.host, self.port), timeout=self.timeout) as connection:
                connection.sendall(b"zVERSION\0")
                version = self._reply(connection, deadline)
            signature_date = datetime.strptime(version.rsplit("/", 1)[-1], "%a %b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - signature_date).total_seconds()
            if not -86400 <= age <= self.max_age_days * 86400:
                raise ValueError("Stale antivirus definitions")
            with socket.create_connection((self.host, self.port), timeout=max(0.01, deadline - time.monotonic())) as connection:
                connection.sendall(b"zINSTREAM\0")
                stream.seek(0)
                while chunk := stream.read(65536):
                    if time.monotonic() >= deadline:
                        raise TimeoutError()
                    connection.settimeout(max(0.01, deadline - time.monotonic()))
                    connection.sendall(struct.pack("!I", len(chunk)) + chunk)
                connection.sendall(b"\0\0\0\0")
                reply = self._reply(connection, deadline)
            if reply.startswith("stream: ") and reply.endswith(" FOUND"):
                raise ValidationError("Arquivo bloqueado pela verificação de segurança. Procure o administrador.")
            if reply != "stream: OK":
                raise ValueError("Antivirus did not confirm clean content")
        except (OSError, ValueError) as error:
            raise ServiceUnavailableError("Verificação de segurança indisponível ou desatualizada. Tente novamente mais tarde.") from error
        finally:
            stream.seek(0)
