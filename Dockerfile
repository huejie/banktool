FROM node:22-alpine
WORKDIR /app

# 先装依赖（利用层缓存）
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev && npm cache clean --force

# 代码与前端构建产物（构建前先在宿主机执行 npm run build）
COPY server ./server
COPY web/dist ./web/dist

ENV PORT=3010 HOST=0.0.0.0
EXPOSE 3010
VOLUME /app/data

CMD ["node", "server/index.js"]
