FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS build

WORKDIR /app

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:stable-alpine@sha256:985220252f3863977e468f611ef118ebd01421289dd86ee1ae99cb068c3bce2b

# Keep the runtime aligned with ops/nginx/Dockerfile (CVE-2026-93990).
RUN apk add --no-cache 'libexpat=2.8.5-r0'

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Falhar no build se a configuracao estiver invalida (inclusive BOM UTF-8).
RUN nginx -t

EXPOSE 80
