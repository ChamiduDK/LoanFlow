FROM node:24-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

COPY package*.json ./
RUN npm install
FROM deps AS build

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

# Optional OCR runtime tools used when OCR_PROVIDER=tesseract or PDF conversion is needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/lib ./lib
COPY --from=build /app/types ./types
COPY --from=build /app/src ./src
COPY --from=build /app/supabase ./supabase
COPY --from=build /app/models_embed.json ./models_embed.json
COPY --from=build /app/models_list.json ./models_list.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/tsconfig.server.json ./tsconfig.server.json

EXPOSE 4000

CMD ["npm", "start"]
