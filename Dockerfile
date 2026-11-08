
FROM node:22.22.3 AS base

WORKDIR /baseer

COPY package*.json ./

FROM base AS dev

RUN npm install -g npm@11.6.0
RUN npm ci

COPY . .

CMD ["npm", "run", "start:dev"]


FROM base AS prod

RUN npm ci --omit=dev

COPY . .

RUN npm run build

CMD ["npm", "run", "start:prod"]
