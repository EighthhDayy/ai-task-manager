# 本文件描述数据库里的表长什么样

from sqlalchemy.orm import DeclarativeBase   # 是 SQLAlchemy 提供的一个基类

from sqlalchemy import Integer, Text, Boolean, ForeignKey, String, UniqueConstraint

from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)

from pgvector.sqlalchemy import Vector

class Base(DeclarativeBase):  # Base继承DeclarativeBase，就获得了 SQLAlchemy ORM 需要的一套能力
    pass

# Python class 是数据库表结构的一份 Python 描述
class Task(Base):
    __tablename__ = "tasks"

    # 属性名: Mapped[Python类型] = mapped_column(
    # 数据库类型,
    # 数据库规则
    # )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )
    title: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id")
    )
    # 加一列，叫描述
    description: Mapped[str| None] = mapped_column(
        Text,
        nullable=True
    )
    # 加一列，是operation_key
    creation_key: Mapped[str | None] = mapped_column(
    String(64),
    nullable=True,
    )

    __table_args__ = (
    UniqueConstraint(
        "user_id",
        "creation_key",     # (user_id, creation_key) 这个组合唯一
        name="uq_tasks_user_creation_key",
    ),
    )

    user:Mapped["User"] = relationship(   # user是在 Task class 上定义的一个属性名字，比如task.user，上面同义
        back_populates="tasks"            # "User" 是类型，即class User(Base)，Task.user 这个属性，里面放的是一个 User 对象，后面可能还有task.user.id
    )                                     #  relationship(...)，管理 Task.user 这个对象关系
                                          # "tasks" 指的是另一边 User class 里的属性名字
                                          # back_populates:反向填充


class User(Base):
    __tablename__ = "users"
    id:Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )
    username:Mapped[str] = mapped_column(
        Text,
        nullable=False,
        unique=True
    )
    email:Mapped[str] = mapped_column(
        Text,
        nullable=False,
        unique=True
    )
    password_hash:Mapped[str| None] = mapped_column(
        Text,
        nullable=True
    )
    tasks: Mapped[list["Task"]] = relationship(     # tasks是User这个class下面定义的一个属性，之所以是复数，因为一个用户可以有多个task
                                                        # relationship()→ Python ORM 对象之间的关系
            back_populates="user" )                      # "user" 指的是另一边 Task class 里的属性名字


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[str] = mapped_column(
        Text,
        primary_key=True
    )

    source_id: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    text: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )
    embedding: Mapped[list[float]] = mapped_column(
        Vector(1536),
        nullable=False
    )
    owner_id: Mapped[int | None] = mapped_column(
    ForeignKey("users.id"),
    nullable=True,
    index=True,
    )
