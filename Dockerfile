FROM node:20-alpine
WORKDIR /app
COPY package.json lib.js server.js trigger.js ./
CMD ["node", "server.js"]
