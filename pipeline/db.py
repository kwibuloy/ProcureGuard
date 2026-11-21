"""Database connection for the Python layers, configured from the repo's .env file."""

import os

import psycopg
from dotenv import load_dotenv

from pipeline import config


def connect(*, autocommit: bool = False) -> psycopg.Connection:
    """Open a connection.

    Without autocommit, everything a `with connect()` block writes is one
    transaction, committed only when the block ends. A long run that saves as it
    goes needs autocommit=True, so each `connection.transaction()` commits.
    """
    load_dotenv(config.ROOT / ".env")
    return psycopg.connect(
        host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        port=os.environ.get("POSTGRES_PORT", "5432"),
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        dbname=os.environ["POSTGRES_DB"],
        autocommit=autocommit,
    )
