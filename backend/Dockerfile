FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de capas Docker)
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

EXPOSE 4000

# npm start corre: sequelize-cli db:migrate && node src/index.js
CMD ["npm", "start"]
