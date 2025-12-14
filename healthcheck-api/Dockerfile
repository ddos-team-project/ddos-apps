# Node.js 18 LTS 기반 이미지 사용
FROM node:18

# 컨테이너 안에서 작업할 디렉토리
WORKDIR /usr/src/app

# 의존성 설치: package.json, package-lock.json만 먼저 복사
COPY package*.json ./

# 프로덕션용 의존성 설치
RUN npm install --only=production

# Node.js 18버전에는 curl이 없을 수도 있어 curl설치
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# 나머지 소스 코드 복사
COPY . .

# 기본 포트 설정 (server.js에서 PORT=3000 사용)
ENV PORT=3000

# HEALTHCHECK: 컨테이너 내부에서 /health 주기적으로 확인
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 컨테이너가 외부에 노출할 포트
EXPOSE 3000

# 컨테이너 시작 시 실행할 명령
CMD ["node", "src/server.js"]
