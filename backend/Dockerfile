# SCAM CUT AI 백엔드 (FastAPI + ONNX AI 모델) — Railway 등 컨테이너 호스팅용
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

# 앱 코드 + 학습된 분류기 가중치(app/ml/weights)
COPY app ./app

# AI 모델 파일(약 470MB)은 저장소에 없으므로 빌드할 때 내려받고 해시를 검증합니다.
RUN python -m app.ml.download

# SQLite 는 시연용입니다(재배포·재시작 시 데이터가 사라질 수 있음). 운영에서는 DATABASE_URL 로 외부 DB 지정.
RUN mkdir -p /srv/data

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
