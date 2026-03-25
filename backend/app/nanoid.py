import re
import secrets
import string

NANOID_SIZE = 12
NANOID_ALPHABET = string.ascii_letters + string.digits + "_-"
NANOID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{12}$")


def generate_nanoid(size: int = NANOID_SIZE) -> str:
    return "".join(secrets.choice(NANOID_ALPHABET) for _ in range(size))
