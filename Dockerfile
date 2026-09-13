FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY dist ./dist
COPY server.ts ./server.ts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "server.ts"]
