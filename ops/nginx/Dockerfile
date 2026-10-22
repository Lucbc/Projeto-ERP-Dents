FROM nginx:stable-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b

# Patch runtime libraries in the pinned upstream image.
RUN apk add --no-cache 'musl=1.2.6-r3' 'musl-utils=1.2.6-r3' 'libexpat=2.9.0-r0' 'libpng=1.6.59-r0' \
    'pcre2=10.49-r0' 'nghttp2-libs=1.70.0-r0' 'zlib=1.3.2-r1' 'tiff=4.7.2-r0' \
    'libx11=1.8.14-r0' 'libxpm=3.5.20-r0'
