from app.core.config import Settings


def test_render_postgres_url_uses_psycopg_driver() -> None:
    settings = Settings(database_url="postgresql://user:pass@host:5432/labelhub")

    assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/labelhub"


def test_explicit_sqlalchemy_database_driver_is_preserved() -> None:
    settings = Settings(database_url="postgresql+psycopg://user:pass@host:5432/labelhub")

    assert settings.database_url == "postgresql+psycopg://user:pass@host:5432/labelhub"


def test_sqlite_database_url_is_preserved() -> None:
    settings = Settings(database_url="sqlite+pysqlite:////tmp/labelhub.sqlite")

    assert settings.database_url == "sqlite+pysqlite:////tmp/labelhub.sqlite"
