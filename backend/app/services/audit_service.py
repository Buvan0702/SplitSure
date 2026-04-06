from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import AuditLog, AuditEventType
from typing import Optional


async def log_event(
    db: AsyncSession,
    group_id: int,
    event_type: AuditEventType,
    actor_id: int,
    entity_id: Optional[int] = None,
    before_json: Optional[dict] = None,
    after_json: Optional[dict] = None,
    metadata_json: Optional[dict] = None,
) -> AuditLog:
    """
    Appends an immutable audit log entry.
    The audit_logs table has a PostgreSQL trigger preventing UPDATE/DELETE.
    """
    log = AuditLog(
        group_id=group_id,
        event_type=event_type,
        actor_id=actor_id,
        entity_id=entity_id,
        before_json=before_json,
        after_json=after_json,
        metadata_json=metadata_json,
    )
    db.add(log)
    await db.flush()
    return log
