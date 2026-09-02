# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_API_URL vacío = el frontend usa proxy relativo /api → nginx lo redirige al backend
# VITE_SSE_ENABLED enciende el stream en vivo: aquí detrás hay un backend permanente que
# puede sostenerlo. En Vercel no se define, y el frontend cae a su refresco periódico.
ARG VITE_SSE_ENABLED=true
ENV VITE_SSE_ENABLED=$VITE_SSE_ENABLED
RUN npm run build

# ── Stage 2: Serve con nginx ───────────────────────────────────
FROM nginx:alpine

# Copiar build
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar config de nginx con proxy al backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
