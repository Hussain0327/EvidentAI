"""Security utilities for API key management."""

import hashlib
import secrets

from ..config import get_settings

settings = get_settings()


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.

    Returns:
        Tuple of (full_key, key_hash, key_prefix)
        - full_key: The complete API key to give to the user (only shown once)
        - key_hash: SHA256 hash to store in the database
        - key_prefix: First characters for key identification
    """
    # Generate random key
    random_part = secrets.token_urlsafe(settings.api_key_length)
    full_key = f"{settings.api_key_prefix}{random_part}"

    # Hash for storage
    key_hash = hash_api_key(full_key)

    # Prefix for identification (show enough to identify, not enough to use)
    key_prefix = full_key[: len(settings.api_key_prefix) + 8]

    return full_key, key_hash, key_prefix


def hash_api_key(key: str) -> str:
    """
    Hash an API key using SHA256.

    Args:
        key: The full API key

    Returns:
        SHA256 hex digest of the key
    """
    return hashlib.sha256(key.encode()).hexdigest()


def verify_api_key(provided_key: str, stored_hash: str) -> bool:
    """
    Verify an API key against its stored hash.

    Args:
        provided_key: The API key provided by the client
        stored_hash: The stored SHA256 hash

    Returns:
        True if the key matches, False otherwise
    """
    return secrets.compare_digest(hash_api_key(provided_key), stored_hash)
