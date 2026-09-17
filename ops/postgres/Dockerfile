FROM postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685

# Patch the pinned base without retaining gosu's outdated Go runtime.
# The official entrypoint uses gosu only to switch to the postgres account.
RUN apk add --no-cache libssl3=3.5.8-r0 libcrypto3=3.5.8-r0 libuuid=2.42.3-r1 su-exec=0.3-r0 \
    && grep -q 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh \
    && sed -i 's/exec gosu postgres/exec su-exec postgres/' /usr/local/bin/docker-entrypoint.sh \
    && rm /usr/local/bin/gosu
