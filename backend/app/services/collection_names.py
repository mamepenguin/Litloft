from sqlalchemy.orm import Session

from app.models import Collection, SmartFolder


def name_in_use(
    db: Session,
    drive: str,
    name: str,
    *,
    exclude_collection_id: str | None = None,
    exclude_smart_folder_id: str | None = None,
) -> bool:
    # Compare in Python: SQL LOWER() folds ASCII only.
    lowered = name.lower()
    for model, exclude_id in (
        (Collection, exclude_collection_id),
        (SmartFolder, exclude_smart_folder_id),
    ):
        query = db.query(model.name).filter(model.drive == drive)
        if exclude_id is not None:
            query = query.filter(model.id != exclude_id)
        if any(existing.lower() == lowered for (existing,) in query):
            return True
    return False
