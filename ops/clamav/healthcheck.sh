#!/bin/sh
# Read the definitions actually loaded by clamd, not just its listening socket.
set -eu
version="$(clamdscan --version 2>/dev/null)" || { echo 'ClamAV is unavailable.' >&2; exit 1; }
stamp="${version##*/}"
loaded="$(date -u -D '%a %b %d %H:%M:%S %Y' -d "$stamp" +%s 2>/dev/null)" || {
    echo 'ClamAV has not reported a valid loaded signature date.' >&2
    exit 1
}
now="$(date -u +%s)"
age="$((now - loaded))"
# Match the API policy: at most seven days old and at most one day in the future.
if [ "$age" -lt -86400 ] || [ "$age" -gt 604800 ]; then
    echo "ClamAV loaded signature age is outside policy: ${age}s." >&2
    exit 1
fi
