FROM node:20-slim

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install
RUN npm install mcp-proxy

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

EXPOSE 8082

CMD ["npx", "mcp-proxy", "--port", "8082", "--", "node", "dist/index.js"]
