FROM nginx:stable-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b

# Patch libexpat and libpng in the pinned upstream image.
RUN apk add --no-cache 'libexpat=2.8.5-r0' 'libpng=1.6.59-r0'
