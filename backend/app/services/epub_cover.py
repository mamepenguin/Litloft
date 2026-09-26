import posixpath
import zipfile
from urllib.parse import unquote
from xml.etree import ElementTree
from xml.parsers import expat

from app.services.zip_names import decode_zip_filename

XML_MAX_BYTES = 1024 * 1024
COVER_MAX_BYTES = 10 * 1024 * 1024

_OPF_MEDIA_TYPE = "application/oebps-package+xml"


class EpubCoverError(Exception):
    pass


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _read_bounded(zf: zipfile.ZipFile, info: zipfile.ZipInfo, limit: int) -> bytes:
    # The header's declared size is the archive's own claim; the limit is
    # enforced on what decompression actually produces.
    with zf.open(info) as f:
        data = f.read(limit + 1)
    if len(data) > limit:
        raise EpubCoverError(f"{info.filename} exceeds {limit} bytes")
    return data


def _refuse_declarations(*_args) -> None:
    raise EpubCoverError("DTD declarations are not accepted")


def _parse_xml(data: bytes) -> ElementTree.Element:
    # Run through expat first so a DOCTYPE is refused in any encoding, before
    # ElementTree would expand an internal entity.
    probe = expat.ParserCreate()
    probe.StartDoctypeDeclHandler = _refuse_declarations
    probe.EntityDeclHandler = _refuse_declarations
    try:
        probe.Parse(data, True)
        return ElementTree.fromstring(data)
    except (expat.ExpatError, ElementTree.ParseError) as e:
        raise EpubCoverError(f"malformed XML: {e}") from e


def _resolve(base_dir: str, href: str) -> str | None:
    path = unquote(href.split("#", 1)[0])
    if not path or path.startswith("/") or "\\" in path or ":" in path:
        return None
    resolved = posixpath.normpath(posixpath.join(base_dir, path))
    if resolved == ".." or resolved.startswith("../") or resolved.startswith("/"):
        return None
    return resolved


def _opf_path(container: ElementTree.Element) -> str | None:
    for el in container.iter():
        if _local(el.tag) == "rootfile" and el.get("media-type") == _OPF_MEDIA_TYPE:
            return _resolve("", el.get("full-path", ""))
    return None


def _cover_href(opf: ElementTree.Element) -> str | None:
    items = [el for el in opf.iter() if _local(el.tag) == "item"]
    for item in items:
        if "cover-image" in (item.get("properties") or "").split():
            return item.get("href")
    cover_id = next(
        (
            el.get("content")
            for el in opf.iter()
            if _local(el.tag) == "meta" and el.get("name") == "cover"
        ),
        None,
    )
    if cover_id is None:
        return None
    return next((item.get("href") for item in items if item.get("id") == cover_id), None)


def read_cover_bytes(epub_path: str) -> bytes | None:
    """The raw bytes of the declared cover, or None when there is none.

    Raises EpubCoverError, zipfile.BadZipFile or OSError on a book that
    cannot be read safely.
    """
    with zipfile.ZipFile(epub_path) as zf:
        entries = {decode_zip_filename(info): info for info in zf.infolist()}

        container_info = entries.get("META-INF/container.xml")
        if container_info is None:
            return None
        opf_path = _opf_path(_parse_xml(_read_bounded(zf, container_info, XML_MAX_BYTES)))
        if opf_path is None or opf_path not in entries:
            return None

        opf = _parse_xml(_read_bounded(zf, entries[opf_path], XML_MAX_BYTES))
        href = _cover_href(opf)
        if not href:
            return None
        cover_path = _resolve(posixpath.dirname(opf_path), href)
        if cover_path is None or cover_path not in entries:
            return None
        return _read_bounded(zf, entries[cover_path], COVER_MAX_BYTES)
