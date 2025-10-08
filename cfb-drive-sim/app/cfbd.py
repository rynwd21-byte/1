import os
import httpx
from typing import Any, Dict, Optional

BASE = "https://api.collegefootballdata.com"
API_KEY = os.getenv("CFBD_API_KEY")

def _headers() -> Dict[str, str]:
    hdrs = {"Accept": "application/json"}
    if API_KEY:
        hdrs["Authorization"] = f"Bearer {API_KEY}"
    return hdrs

async def get(path: str, params: Optional[Dict[str, Any]] = None):
    if not API_KEY:
        raise RuntimeError("CFBD_API_KEY is not set in environment.")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE}{path}", params=params or {}, headers=_headers())
        r.raise_for_status()
        return r.json()
