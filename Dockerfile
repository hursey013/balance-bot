FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY src ./src
COPY data ./data

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
