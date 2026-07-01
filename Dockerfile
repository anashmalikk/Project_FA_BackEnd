FROM node:22-alpine AS build

WORKDIR /usr/src/app

RUN apk add --no-cache openssl

COPY package.json ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN npm install
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY package.json ./

EXPOSE 5000

CMD ["node", "dist/server.js"]
