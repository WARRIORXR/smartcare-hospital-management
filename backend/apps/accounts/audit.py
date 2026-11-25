"""
apps/accounts/audit.py
======================
Lightweight helper for writing structured security & clinical access audit logs.
"""

from .models import AuditLog


def get_client_ip(request):
    if not request:
        return ''
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()[:64]
    return (request.META.get('REMOTE_ADDR') or '')[:64]


def record_audit_log(
    request,
    action,
    resource_type,
    resource_id='',
    patient=None,
    details='',
    actor=None,
    actor_username=None,
    actor_role=None,
):
    """Persist an AuditLog entry without raising exceptions into callers."""
    try:
        user = actor or (request.user if request and getattr(request, 'user', None) and request.user.is_authenticated else None)
        AuditLog.objects.create(
            actor=user,
            actor_username=actor_username or (user.username if user else 'anonymous'),
            actor_role=actor_role or (getattr(user, 'role', '') if user else 'anonymous'),
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id not in (None, '') else '',
            patient=patient,
            ip_address=get_client_ip(request),
            user_agent=(request.META.get('HTTP_USER_AGENT', '')[:255] if request else ''),
            details=details[:2000] if details else '',
        )
    except Exception:
        # Audit logging should never crash a valid transaction if DB table isn't ready during migrations
        pass
