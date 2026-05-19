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


class Application(Base):
    __tablename__ = "application"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("job.id", ondelete="CASCADE"), nullable=False, unique=True)
    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(32), default="applied", nullable=False)  # applied|interviewing|rejected|offer|ghost
    notes = Column(Text, default="")
    follow_up_at = Column(DateTime)

    job = relationship("Job")


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
