"""Seeding helpers shared by the sidecar subtitle test modules."""
import hashlib
import io
import shutil
from pathlib import Path

from app.models import File

FIXTURES_DIR = Path(__file__).parent / "fixtures"

SRT = "1\n00:00:01,000 --> 00:00:02,000\nhello\n"
VTT = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n"
LOFT_MIME = "application/vnd.litloft.loft+json"
TOO_LARGE = 5 * 1024 * 1024 + 1


def seed(db, drive_dir, filename="movie.mp4", folder="a", *, drive="test-drive",
         file_type="video", mime="video/mp4", write=True, **state):
    d = drive_dir / folder if folder else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    path = d / filename
    if write:
        if file_type == "video":
            shutil.copy(FIXTURES_DIR / "short_video.mp4", path)
        elif mime == LOFT_MIME:
            path.write_text("{}", encoding="utf-8")
        else:
            path.write_text("body\n", encoding="utf-8")
    row = File(
        filename=filename,
        title=filename,
        drive=drive,
        folder_path=folder,
        file_path=f"{folder}/{filename}" if folder else filename,
        file_size=path.stat().st_size if path.exists() else 1,
        file_type=file_type,
        mime_type=mime,
        **state,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def retire(db, row):
    row.file_path = f"__missing_{row.id}_{row.file_path}"
    db.commit()
    return row


def sidecar(drive_dir, folder, name, body=None):
    d = drive_dir / folder if folder else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    data = SRT.encode() if body is None else body
    (d / name).write_bytes(data)
    return data


def names(drive_dir, folder):
    d = drive_dir / folder if folder else drive_dir
    return sorted(p.name for p in d.iterdir())


def snapshot(directory):
    return {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(directory.iterdir())
        if p.is_file()
    }


def rows(db):
    db.expire_all()
    return {
        r.id: (r.filename, r.folder_path, r.file_path)
        for r in db.query(File).all()
    }


def subtitles(c, file_id):
    res = c.get(f"/api/files/{file_id}")
    assert res.status_code == 200, res.text
    return res.json()["subtitles"]


def filenames(c, file_id):
    """The listed sidecar names; ``None`` until the field is reported."""
    return [s.get("filename") for s in subtitles(c, file_id)]


def languages(c, file_id):
    return [s["language"] for s in subtitles(c, file_id)]


def detail(res):
    return res.json()["detail"]


def upload_base(c, drive, folder, filename, size):
    return c.post(
        f"/api/drives/{drive}/upload/init",
        json={"filename": filename, "file_size": size, "folder_path": folder},
    )


def _upload_session(c, drive, folder, filename, body):
    init = upload_base(c, drive, folder, filename, len(body))
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]
    chunk = c.post(
        f"/api/drives/{drive}/upload/{upload_id}/chunk",
        data={"chunk_index": 0},
        files={"chunk": ("chunk", io.BytesIO(body))},
    )
    assert chunk.status_code == 200, chunk.text
    return c.post(f"/api/drives/{drive}/upload/{upload_id}/complete")


def upload(c, drive, folder, filename, body=SRT.encode()):
    done = _upload_session(c, drive, folder, filename, body)
    assert done.status_code == 200, done.text
    return done


def upload_and_complete(c, drive, folder, filename, body):
    """The complete answer without asserting success, for a refused body."""
    return _upload_session(c, drive, folder, filename, body)


def add_subtitle(c, file_id, body, filename="picked.srt", language=""):
    return c.post(
        f"/api/files/{file_id}/subtitles",
        files={"file": (filename, body, "application/x-subrip")},
        data={"language": language},
    )


def replace_subtitle(c, file_id, name, body, filename="picked.srt"):
    return c.put(
        f"/api/files/{file_id}/subtitles",
        files={"file": (filename, body, "application/x-subrip")},
        data={"name": name},
    )


def delete_subtitle(c, file_id, name):
    return c.delete(f"/api/files/{file_id}/subtitles", params={"name": name})
