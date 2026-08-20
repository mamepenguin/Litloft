from sqlalchemy import create_engine, inspect


def test_file_versions_table_created_for_fresh_and_existing_databases(tmp_path):
    from app.database import Base, _migrate

    fresh = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    Base.metadata.create_all(bind=fresh)
    _migrate(fresh)
    assert "file_versions" in inspect(fresh).get_table_names()

    existing = create_engine(f"sqlite:///{tmp_path / 'existing.db'}")
    legacy_tables = [
        table
        for table in Base.metadata.sorted_tables
        if table.name != "file_versions"
    ]
    Base.metadata.create_all(bind=existing, tables=legacy_tables)
    assert "file_versions" not in inspect(existing).get_table_names()

    Base.metadata.create_all(bind=existing)
    _migrate(existing)
    assert "file_versions" in inspect(existing).get_table_names()

    Base.metadata.create_all(bind=existing)
    _migrate(existing)
    assert "file_versions" in inspect(existing).get_table_names()
