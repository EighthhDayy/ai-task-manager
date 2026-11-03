import os
# import psycopg

from sqlalchemy import create_engine, URL

from dotenv import load_dotenv
# from psycopg.rows import dict_row

from sqlalchemy.orm import Session


load_dotenv()




# def get_connection():
#     return psycopg.connect(
#         host=os.getenv("DB_HOST"),
#         port=os.getenv("DB_PORT"),
#         dbname=os.getenv("DB_NAME"),
#         user=os.getenv("DB_USER"),
#         password=os.getenv("DB_PASSWORD"),
#         row_factory=dict_row
#     )

DATABASE_URL = URL.create(
    drivername="postgresql+psycopg",  # psycopg → 底层使用 psycopg 这个 driver
    username=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", "5432")),
    database=os.getenv("DB_NAME"),
)

# 数据库连接引擎
engine = create_engine(   # SQLAlchemy 管理数据库连接、准备执行 SQL 的总入口
    DATABASE_URL,
    echo=True           # SQLAlchemy 背后执行了什么 SQL，都打印到 PowerShell
)

def get_db():
    with Session(engine) as session:
        yield session

