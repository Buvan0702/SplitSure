"""
Push notification service via Expo Push API.
Non-blocking, fire-and-forget with error suppression.
"""
import httpx
from typing import Optional
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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


async def notify_group_invite(
    db: AsyncSession,
    user_id: int,
    group_name: str,
    inviter_name: str,
) -> None:
    """
    Send push notification when user is invited/added to a group.
    Fire-and-forget, silently fail.
    """
    from app.models.user import User

    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.push_token:
            return

        await send_push_notification(
            push_token=user.push_token,
            title="Group Invite",
            body=f"{inviter_name} added you to {group_name}",
            data={"type": "group_invite", "group_name": group_name},
        )
    except Exception as e:
        logger.warning(f"Failed to send group invite notification: {e}")


async def notify_group_invitation(
    db: AsyncSession,
    user_id: int,
    group_name: str,
    inviter_name: str,
    invitation_id: int,
) -> None:
    """
    Send a push notification for a pending invitation.
    Fire-and-forget, silently fail.
    """
    from app.models.user import User

    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.push_token:
            return

        await send_push_notification(
            push_token=user.push_token,
            title="Group Invitation",
            body=f"{inviter_name} invited you to join {group_name}",
            data={
                "type": "group_invite",
                "group_name": group_name,
                "invitation_id": invitation_id,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to send invitation notification: {e}")
