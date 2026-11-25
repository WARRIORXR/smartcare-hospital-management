"""
apps/opd/notifications.py
=========================
SMS / WhatsApp / In-App notification dispatcher when a patient's OPD token
reaches <= 3 positions away (or when called).
Uses Twilio REST API when TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are configured,
and cleanly records simulated notifications in Sandbox/Test environments.
"""

import base64
import json
import urllib.parse
import urllib.request
from django.conf import settings
from django.db.models import Case, When, Value, IntegerField

from .models import Token, Notification


def _priority_order():
    return Case(
        When(priority='emergency', then=Value(1)),
        When(priority='senior_citizen', then=Value(2)),
        When(priority='normal', then=Value(3)),
        default=Value(4),
        output_field=IntegerField(),
    )


def _send_twilio_message(to_phone, message, via_whatsapp=False):
    """Send SMS or WhatsApp via Twilio REST API using stdlib urllib (zero extra deps)."""
    sid = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
    auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
    from_phone = getattr(settings, 'TWILIO_WHATSAPP_FROM' if via_whatsapp else 'TWILIO_FROM_PHONE', '')

    if not (sid and auth_token and from_phone and to_phone):
        return 'simulated'

    try:
        to_val = f"whatsapp:{to_phone}" if (via_whatsapp and not to_phone.startswith('whatsapp:')) else to_phone
        payload = urllib.parse.urlencode({
            'To': to_val,
            'From': from_phone,
            'Body': message,
        }).encode('utf-8')
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
        creds = base64.b64encode(f"{sid}:{auth_token}".encode('utf-8')).decode('ascii')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Authorization', f'Basic {creds}')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 'sent' if 200 <= resp.status < 300 else 'failed'
    except Exception:
        return 'failed'


def dispatch_queue_proximity_notifications(doctor, appointment_date):
    """
    Notify waiting patients whose queue position is <= 3 (i.e. 0, 1, or 2 patients ahead).
    Prevents duplicate proximity alerts for the same token.
    Returns list of newly created Notification objects.
    """
    waiting_tokens = list(
        Token.objects.filter(
            doctor=doctor,
            appointment_date=appointment_date,
            status='waiting'
        )
        .select_related('patient__user', 'doctor__user')
        .annotate(priority_rank=_priority_order())
        .order_by('priority_rank', 'token_number')
    )

    created = []
    for idx, tok in enumerate(waiting_tokens[:3], start=1):
        # Skip if proximity alert was already sent for this token
        already_sent = Notification.objects.filter(
            token=tok,
            trigger_event='queue_proximity'
        ).exists()
        if already_sent:
            continue

        phone = (tok.patient.user.phone or '').strip()
        doc_name = f"Dr. {tok.doctor.user.get_full_name() or tok.doctor.user.username}"
        room = tok.doctor.room_number or 'OPD Room'
        ahead = idx - 1
        title = f"Queue Alert: Token {tok.token_code} is #{idx} in line"
        msg = (
            f"SmartCare HMS: Your OPD Token {tok.token_code} for {doc_name} ({room}) "
            f"is now {idx} position(s) away ({ahead} patient(s) ahead). "
            f"Please proceed to the waiting lounge."
        )

        # Dispatch SMS + WhatsApp + In-App notification entries
        sms_status = _send_twilio_message(phone, msg, via_whatsapp=False)
        wa_status = _send_twilio_message(phone, msg, via_whatsapp=True)

        created.append(Notification.objects.create(
            patient=tok.patient,
            token=tok,
            channel='sms',
            trigger_event='queue_proximity',
            recipient_phone=phone,
            title=title,
            message=msg,
            status=sms_status,
        ))
        created.append(Notification.objects.create(
            patient=tok.patient,
            token=tok,
            channel='whatsapp',
            trigger_event='queue_proximity',
            recipient_phone=phone,
            title=title,
            message=msg,
            status=wa_status,
        ))
        created.append(Notification.objects.create(
            patient=tok.patient,
            token=tok,
            channel='in_app',
            trigger_event='queue_proximity',
            recipient_phone=phone,
            title=title,
            message=msg,
            status='sent',
        ))

    return created
