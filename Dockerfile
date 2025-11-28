# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apk add --no-cache openssl

# Copy package.json and pnpm-lock.yaml
COPY package*.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Generate Prisma client and build TypeScript
RUN pnpm run build

# Stage 2: Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install OpenSSL (required by Prisma at runtime)
RUN apk add --no-cache openssl

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files first
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy prisma schema (needed for db push at runtime)
COPY --from=builder /app/prisma ./prisma

# Copy node_modules from builder (includes generated Prisma client)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy startup script
COPY --from=builder /app/scripts ./scripts
RUN chmod +x ./scripts/start.sh

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application - syncs database schema before starting
CMD ["./scripts/start.sh"]