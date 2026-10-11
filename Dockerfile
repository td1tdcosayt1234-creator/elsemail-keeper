FROM node:20-alpine
WORKDIR /app
COPY package.json trigger.js ./
CMD ["node", "trigger.js"]
