FROM node:20-alpine
WORKDIR /app
COPY package.json server.js trigger.js ./
CMD ["node", "server.js"]
