"""
db_adapter.py - Database Adapter for SQLite (dev) and PostgreSQL (production)

If DATABASE_URL environment variable is set → uses PostgreSQL (Railway/production)
Otherwise → uses SQLite (local development)

This adapter normalizes the differences between sqlite3 and psycopg2 so that
the rest of the codebase can use the same query syntax everywhere.
"""

import os
import sqlite3

# Detect which database engine to use
DATABASE_URL = os.environ.get('DATABASE_URL')
USE_POSTGRES = DATABASE_URL is not None

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool

# ── Connection pool (PostgreSQL only) ─────────────────────────────────────
# Keeps a small pool of open connections so each request reuses an existing
# connection instead of opening a brand-new TCP handshake to Postgres.
_pg_pool = None

def _get_pg_pool():
    """Lazily initialize the PostgreSQL connection pool."""
    global _pg_pool
    if _pg_pool is None:
        db_url = DATABASE_URL
        if db_url.startswith('postgres://'):
            db_url = db_url.replace('postgres://', 'postgresql://', 1)
        _pg_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=db_url
        )
    return _pg_pool

def get_db_connection():
    """
    Returns a database connection.
    - Production (DATABASE_URL set): PostgreSQL via psycopg2 (pooled)
    - Development (no DATABASE_URL): SQLite via sqlite3

    Both return dict-like row access.
    """
    if USE_POSTGRES:
        pool = _get_pg_pool()
        conn = pool.getconn()
        conn.autocommit = False
        return PgConnectionWrapper(conn, pool)
    else:
        conn = sqlite3.connect('mindlobby.db')
        conn.row_factory = sqlite3.Row
        return conn


def is_postgres():
    """Check if we're running PostgreSQL (production) or SQLite (dev)."""
    return USE_POSTGRES


# ============================================================================
# PostgreSQL Wrapper Classes
# ============================================================================
# These wrappers make psycopg2 behave like sqlite3 so existing code works
# unchanged: ? placeholders, dict-like row access, cursor.lastrowid, etc.

class PgRowDict(dict):
    """A dict subclass that also supports index-based access like sqlite3.Row."""
    def __init__(self, keys, values):
        super().__init__(zip(keys, values))
        self._keys = keys
        self._values = values

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def keys(self):
        return self._keys


class PgCursorWrapper:
    """Wraps a psycopg2 cursor to accept ? placeholders and return dict rows."""

    def __init__(self, cursor):
        self._cursor = cursor
        self._lastrowid = None

    @property
    def lastrowid(self):
        return self._lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def _translate_query(self, sql):
        """Convert ? placeholders to %s for psycopg2."""
        # Simple replacement — works because our queries don't have ? inside strings
        return sql.replace('?', '%s')

    def _inject_returning(self, sql):
        """Add RETURNING id to INSERT statements to support lastrowid."""
        stripped = sql.strip().rstrip(';')
        upper = stripped.upper()
        if upper.startswith('INSERT') and 'RETURNING' not in upper:
            return stripped + ' RETURNING id'
        return sql

    # Tables that don't have an 'id' column — skip RETURNING id for these
    _NO_ID_TABLES = {'user_settings', 'document_topics'}

    def _table_has_no_id(self, sql):
        """Check if the INSERT targets a table that has no 'id' column."""
        import re
        match = re.match(r'INSERT\s+INTO\s+(\w+)', sql.strip(), re.IGNORECASE)
        if match:
            return match.group(1).lower() in self._NO_ID_TABLES
        return False

    def execute(self, sql, params=None):
        translated = self._translate_query(sql)

        # For INSERT statements, add RETURNING id to capture lastrowid
        # Skip tables that don't have an id column
        has_returning = False
        stripped_upper = translated.strip().upper()
        if (stripped_upper.startswith('INSERT')
                and 'RETURNING' not in stripped_upper
                and not self._table_has_no_id(translated)):
            translated = translated.strip().rstrip(';') + ' RETURNING id'
            has_returning = True

        self._cursor.execute(translated, params or ())

        if has_returning:
            row = self._cursor.fetchone()
            if row:
                self._lastrowid = row[0]

        return self

    def executemany(self, sql, params_list):
        translated = self._translate_query(sql)
        self._cursor.executemany(translated, params_list)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        if self._cursor.description:
            keys = [desc[0] for desc in self._cursor.description]
            return PgRowDict(keys, list(row))
        return row

    def fetchall(self):
        rows = self._cursor.fetchall()
        if self._cursor.description:
            keys = [desc[0] for desc in self._cursor.description]
            return [PgRowDict(keys, list(row)) for row in rows]
        return rows


class PgConnectionWrapper:
    """Wraps a psycopg2 connection to behave like an sqlite3 connection."""

    def __init__(self, conn, pool=None):
        self._conn = conn
        self._pool = pool

    def cursor(self):
        return PgCursorWrapper(self._conn.cursor())

    def execute(self, sql, params=None):
        """Convenience method matching sqlite3's conn.execute()."""
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        """Return connection to pool (or close if no pool)."""
        if self._pool:
            self._pool.putconn(self._conn)
        else:
            self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._conn.rollback()
        self.close()