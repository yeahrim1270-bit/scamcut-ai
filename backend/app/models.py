"""데이터 모델.

관계
  Incident 1 ──< Evidence      (사건 삭제 시 자료는 incident_id=NULL 로 '미분류'가 됨: ON DELETE SET NULL)
  Incident 1 ──< AnalysisJob   (사건 삭제 시 분석 요청 기록도 함께 삭제: ON DELETE CASCADE)

시각 값은 ISO-8601 문자열(UTC, 'Z')로 저장해 DB 종류와 무관하게 동일하게 동작합니다.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def new_id() -> str:
    return uuid.uuid4().hex


CHANNELS = ("sms", "call", "email")
JOB_STATUSES = ("pending", "running", "succeeded", "failed")


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    memo: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)

    evidence: Mapped[list["Evidence"]] = relationship(back_populates="incident", passive_deletes=True)
    analysis_jobs: Mapped[list["AnalysisJob"]] = relationship(back_populates="incident", passive_deletes=True)


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint("channel IN ('sms','call','email')", name="ck_evidence_channel"),
        Index("ix_evidence_incident_id", "incident_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    incident_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    sender: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    occurred_at: Mapped[str] = mapped_column(String(32), nullable=False, default="")  # 비어 있을 수 있음
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)

    incident: Mapped[Optional[Incident]] = relationship(back_populates="evidence")


class AnalysisJob(Base):
    """분석 요청 1건. 상태: pending(대기) → running(진행) → succeeded(성공) | failed(실패)."""

    __tablename__ = "analysis_jobs"
    __table_args__ = (
        CheckConstraint("status IN ('pending','running','succeeded','failed')", name="ck_job_status"),
        Index("ix_analysis_jobs_incident_id", "incident_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    incident_id: Mapped[str] = mapped_column(String(64), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    analyzers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 요청한 분석기 key 목록
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # 분석기별 진행·결과
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # 성공 시 종합 결과
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)
    started_at: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    finished_at: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    incident: Mapped[Incident] = relationship(back_populates="analysis_jobs")


class User(Base):
    """회원. 비밀번호는 해시(scrypt)로만 저장합니다."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)  # 소문자로 정규화해 저장
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)


class AuthSession(Base):
    """로그인 세션. 토큰 원문은 저장하지 않고 SHA-256 해시만 저장합니다."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_user_id", "user_id"),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False, default=now_iso)
    expires_at: Mapped[str] = mapped_column(String(32), nullable=False)
