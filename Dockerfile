FROM node:20-alpine

# git + python3 needed by Baileys and some native deps
RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
