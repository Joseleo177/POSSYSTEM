FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Cache de npm entre builds — solo re-descarga si cambia package.json
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
