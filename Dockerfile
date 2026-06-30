FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY scripts/serve.mjs scripts/serve.mjs
COPY data/ data/
COPY --from=builder /app/dist dist/

ENV PORT=4174
ENV HOST=0.0.0.0
EXPOSE 4174

CMD ["node", "scripts/serve.mjs"]
