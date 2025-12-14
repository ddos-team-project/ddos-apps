# Healthcheck API

Aurora MySQL 연동 헬스체크 API

## 개요

- **목적**: EC2 → Aurora 연결 테스트 및 헬스체크
- **기술**: Node.js + Express + MySQL2
- **배포**: GitHub Actions → ECR → EC2

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `PORT` | ❌ | `3000` | 서버 포트 |
| `SERVICE_NAME` | ❌ | `ddos-healthcheck-api` | 서비스 이름 |
| `REGION` | ❌ | `local` | 리전 |
| `APP_ENV` | ❌ | `dev` | 환경 |
| `DB_HOST` | ✅ | - | Aurora Writer 엔드포인트 |
| `DB_PORT` | ❌ | `3306` | DB 포트 |
| `DB_NAME` | ✅ | - | 데이터베이스 이름 |
| `DB_USER` | ✅ | - | DB 사용자 |
| `DB_PASSWORD` | ✅ | - | DB 비밀번호 |

## API

### `GET /health`

**응답 (정상):**
```json
{
  "status": "ok",
  "service": "ddos-healthcheck-api",
  "region": "seoul",
  "env": "prod",
  "db": {
    "status": "ok"
  },
  "timestamp": "2025-12-08T05:20:46.461Z"
}
```

**응답 (DB 오류):**
```json
{
  "status": "degraded",
  "service": "ddos-healthcheck-api",
  "region": "seoul",
  "env": "prod",
  "db": {
    "status": "error",
    "message": "ER_ACCESS_DENIED_ERROR"
  },
  "timestamp": "2025-12-08T05:20:46.461Z"
}
```

## 로컬 실행
```bash
# 의존성 설치
npm install

# 환경변수 설정
export DB_HOST=<Aurora_Cluster_Writer_엔드포인트>
export DB_PORT=3306
export DB_NAME=ddos_noncore
export DB_USER=app_admin
export DB_PASSWORD=<비밀번호>

# 실행
npm start
```

## Docker 빌드 (로컬 테스트)
```bash
docker build -t healthcheck-api:dev .

docker run -d \
  --name healthcheck-api \
  -p 8080:3000 \
  -e DB_HOST=<Aurora_Cluster_Writer_엔드포인트> \
  -e DB_NAME=ddos_noncore \
  -e DB_USER=app_admin \
  -e DB_PASSWORD=<비밀번호> \
  healthcheck-api:dev
```