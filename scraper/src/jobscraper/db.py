from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

from .config import DB_URL


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "job"

    id = Column(Integer, primary_key=True)
    source = Column(String(32), nullable=False, index=True)
    source_id = Column(String(128), nullable=False)
    source_url = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    company = Column(Text)
    location = Column(Text)
    remote = Column(Integer, default=0)
    posted_at = Column(DateTime)
    description = Column(Text, nullable=False, default="")
    seniority = Column(String(32))
    employment_type = Column(String(32))
    salary_min = Column(Float)
    salary_max = Column(Float)
    currency = Column(String(8))
    scraped_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    extracted_at = Column(DateTime)
    auto_briefed_at = Column(DateTime)  # set when bot auto-sent a brief to Telegram

    skills = relationship("JobSkill", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_job_source"),
        Index("ix_job_posted", "posted_at"),
    )


class JobSkill(Base):
    __tablename__ = "job_skill"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("job.id", ondelete="CASCADE"), nullable=False, index=True)
    skill = Column(String(64), nullable=False, index=True)
    category = Column(String(32), nullable=False)
    weight = Column(Float, default=1.0, nullable=False)

    job = relationship("Job", back_populates="skills")

    __table_args__ = (UniqueConstraint("job_id", "skill", name="uq_job_skill"),)


class Conversation(Base):
    __tablename__ = "conversation"

    id = Column(Integer, primary_key=True)
    type = Column(String(32), nullable=False, index=True)  # 'assistant' | 'interview'
    title = Column(Text, nullable=False, default="Untitled")
    meta_json = Column(Text, default="{}")  # topic, mode, lang, etc.
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    messages = relationship("Message", back_populates="conversation",
                            cascade="all, delete-orphan", order_by="Message.id")


class Message(Base):
    __tablename__ = "message"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversation.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    role = Column(String(32), nullable=False)  # 'user' | 'assistant'
    content = Column(Text, nullable=False, default="")
    meta_json = Column(Text, default="{}")     # tool_calls, etc.
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class Application(Base):
    __tablename__ = "application"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("job.id", ondelete="CASCADE"), nullable=False, unique=True)
    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(32), default="applied", nullable=False)  # applied|interviewing|rejected|offer|ghost
    notes = Column(Text, default="")
    follow_up_at = Column(DateTime)

    job = relationship("Job")


class Drawing(Base):
    __tablename__ = "drawing"

    id = Column(Integer, primary_key=True)
    slug = Column(String(120), nullable=False, unique=True, index=True)
    title = Column(Text, nullable=False, default="")
    category = Column(String(64), nullable=False, default="misc", index=True)  # e.g. "react", "javascript"
    content_json = Column(Text, nullable=False, default="{}")  # full excalidraw scene JSON
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


_engine = create_engine(DB_URL, future=True)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    Base.metadata.create_all(_engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
