import zipfile


def decode_zip_filename(info: zipfile.ZipInfo) -> str:
    """Decode ZIP entry filename, handling Shift_JIS encoded names.

    ZIP files created on Japanese Windows encode filenames in Shift_JIS (CP932)
    but don't set the UTF-8 flag. Python's zipfile decodes them as CP437,
    producing garbled text. This function detects and re-decodes as CP932.
    """
    # If UTF-8 flag is set, Python already decoded correctly
    if info.flag_bits & 0x800:
        return info.filename

    # Try re-encoding from CP437 back to bytes, then decode as CP932
    try:
        raw = info.filename.encode("cp437")
    except UnicodeEncodeError:
        return info.filename

    # Pure ASCII is identical in both encodings — no need to re-decode
    if all(b < 0x80 for b in raw):
        return info.filename

    try:
        return raw.decode("cp932")
    except UnicodeDecodeError:
        # Not Shift_JIS — return as-is (original CP437 decode)
        return info.filename
