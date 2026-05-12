FROM oven/bun:1-slim

WORKDIR /app

# Prisma requires OpenSSL at runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun prisma generate

EXPOSE 3000

ENV NODE_ENV=production

CMD ["bun", "run", "src/main.ts"]
