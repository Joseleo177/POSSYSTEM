FROM node:20-alpine

# Alpine no trae la base de zonas horarias: sin tzdata, TZ=America/Caracas se
# ignora sin avisar y new Date() vuelve a UTC, que es justo el bug que esto arregla.
RUN apk add --no-cache tzdata

WORKDIR /app

# Instalar dependencias primero (aprovecha cache de capas Docker)
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

EXPOSE 4000

# npm start corre: sequelize-cli db:migrate && node src/index.js
# El binario sale de node_modules (sequelize-cli es dependencia de producción), NO de npx:
# npx lo descargaba en cada arranque y una descarga a medias dejó su caché corrupta
# (ENOTEMPTY al renombrar), con el contenedor en reinicio infinito y la API caída. Además
# así el sistema levanta sin internet, que es la mitad de para qué existe el modo local.
CMD ["npm", "start"]
