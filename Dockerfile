FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root (lockfile lives here in npm workspaces)
COPY package.json ./
COPY packages/api/package.json ./packages/api/

# Install API workspace deps
RUN npm install --workspace=packages/api

# Build
COPY packages/api/tsconfig.json ./packages/api/
COPY packages/api/src ./packages/api/src
RUN cd packages/api && npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY packages/api/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/packages/api/dist ./dist

# AI-friendly docs served at /llms.txt and /openapi.yaml
COPY llms.txt ./
COPY openapi.yaml ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
