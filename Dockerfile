
FROM node:22.22.3 AS base

WORKDIR /baseer

# Install FFmpeg and FFprobe from OS package manager for audio probing and normalization
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

FROM base AS dev

RUN npm install -g npm@11.6.0
RUN npm ci

COPY . .

CMD ["npm", "run", "start:dev"]


FROM base AS prod

RUN npm ci

COPY . .

RUN npm run build

RUN npm prune --omit=dev

CMD ["npm", "run", "start:prod"]
