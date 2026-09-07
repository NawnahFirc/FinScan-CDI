FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY FinScan-CDI-v3.7.0/package*.json ./FinScan-CDI-v3.7.0/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
