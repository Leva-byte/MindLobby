"""
Shared utility helpers for MindLobby.
"""
from flask import request


def get_real_ip(req=None):
    """
    Return the real client IP, respecting X-Forwarded-For behind reverse proxies
    (e.g. Railway, Heroku, Nginx).  Falls back to remote_addr for local dev.
    """
    if req is None:
        req = request
    forwarded = req.headers.get('X-Forwarded-For')
    if forwarded:
        # X-Forwarded-For: client, proxy1, proxy2 — first entry is the real client
        return forwarded.split(',')[0].strip()
    return req.remote_addr
