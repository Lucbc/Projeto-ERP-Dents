FROM clamav/clamav:1.4@sha256:a5f03c12a79dbe9f6d8a527b6bb1ea053fa8dd061d3738a26897f055ee2d9303

# Patch runtime libraries without changing the antivirus entrypoint or data paths.
RUN apk add --no-cache 'pcre2=10.49-r0' 'nghttp2-libs=1.70.0-r0'
