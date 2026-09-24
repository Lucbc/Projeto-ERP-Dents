FROM nginx:stable-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b

# The pinned upstream image still includes the vulnerable libexpat 2.8.4.
RUN apk add --no-cache 'libexpat=2.8.5-r0'
