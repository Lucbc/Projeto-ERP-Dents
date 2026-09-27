#!/bin/sh
# FreshClam may finish before clamd opens its socket. Retry the notification
# outside the healthcheck; readiness still checks the actually loaded database.
set -eu
deadline="$(($(date -u +%s) + 300))"
until timeout 5 clamdscan --reload >/dev/null 2>&1; do
    if [ "$(date -u +%s)" -ge "$deadline" ]; then
        echo 'ClamAV reload notification timed out; readiness remains enforced.' >&2
        exit 1
    fi
    sleep 2
done
echo 'ClamAV database reload requested after signature update.'
