FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts
RUN npm rebuild better-sqlite3 --build-from-source

COPY . .
RUN npm run build

# Create data directories during build so they exist in the image
RUN node scripts/ensure-dirs.js

EXPOSE 3000
CMD sh -c "node_modules/.bin/next start -p ${PORT:-3000}"
