FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV CACHE_ENABLED=false
EXPOSE 8080
CMD ["node", "server.js"]
