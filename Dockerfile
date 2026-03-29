FROM node:20-alpine AS builder

WORKDIR /app

# Install API dependencies
COPY packages/api/package*.json ./packages/api/
RUN cd packages/api && npm ci

# Build
COPY packages/api/tsconfig.json ./packages/api/
COPY packages/api/src ./packages/api/src
RUN cd packages/api && npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY packages/api/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/packages/api/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
