"""
Push notification service via Expo Push API.
Non-blocking, fire-and-forget with error suppression.
"""
import httpx
from typing import Optional
import logging

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    push_token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    """
    Send a push notification via Expo's push service.
    Silently fails — push is a nice-to-have, never blocks the main flow.
    """
    if not push_token or not push_token.startswith("ExponentPushToken"):
        return

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                EXPO_PUSH_URL,
                json={
                    "to": push_token,
                    "title": title,
                    "body": body,
                    "data": data or {},
                    "sound": "default",
                    "priority": "high",
                },
                timeout=5.0,
            )
    except Exception as e:
        logger.warning(f"Push notification failed: {e}")
