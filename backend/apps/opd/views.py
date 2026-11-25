"""
apps/opd/views.py
==================
Views for OPD Token Generation, Advance Time-Slot Booking, Patient Notifications,
Doctor Live Queue Management, and Role-Secured Display Screen Data.
"""

from datetime import datetime
from django.db.models import Case, IntegerField, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.audit import record_audit_log
from apps.accounts.models import Doctor, DoctorLeave
from .models import Notification, Queue, Token
from .notifications import dispatch_queue_proximity_notifications
from .serializers import (
    STANDARD_TIME_SLOTS,
    NotificationSerializer,
    PublicDisplayTokenSerializer,
    TokenGenerateSerializer,
    TokenSerializer,
)


def get_priority_order():
    return Case(
        When(priority='emergency', then=Value(1)),
        When(priority='senior_citizen', then=Value(2)),
        When(priority='normal', then=Value(3)),
        default=Value(4),
        output_field=IntegerField(),
    )


class IsClinicalStaffOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.role in ['admin', 'doctor', 'reception']
                or request.user.is_staff
                or request.user.is_superuser
            )
        )


class TokenGenerateView(APIView):
    """POST /api/opd/tokens/generate/ -> Book walk-in token or advance appointment slot."""

    permission_classes = [IsAuthenticated]
    serializer_class = TokenGenerateSerializer

    @extend_schema(request=TokenGenerateSerializer, responses={201: TokenSerializer})
    def post(self, request):
        if request.user.role not in ['patient', 'reception', 'admin', 'doctor'] and not request.user.is_staff:
            return Response({"detail": "Not authorized to generate OPD tokens."}, status=status.HTTP_403_FORBIDDEN)

        serializer = TokenGenerateSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            token = serializer.save()
            record_audit_log(
                request,
                action='CREATE',
                resource_type='OPDToken',
                resource_id=token.id,
                patient=token.patient,
                details=f"Generated {token.token_code} for {token.appointment_date} {token.time_slot or 'Walk-In'}.",
            )
            # Trigger proximity check immediately if appointment is today
            if token.appointment_date == timezone.now().date():
                dispatch_queue_proximity_notifications(token.doctor, token.appointment_date)
            return Response(TokenSerializer(token).data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DoctorAvailableSlotsView(APIView):
    """GET /api/opd/doctors/<doctor_id>/slots/?date=YYYY-MM-DD -> Check leave & available time slots."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request, doctor_id):
        doctor = get_object_or_404(Doctor, pk=doctor_id)
        date_str = request.query_params.get('date')
        today = timezone.now().date()
        if date_str:
            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            target_date = today

        leave = DoctorLeave.objects.filter(
            doctor=doctor, is_approved=True, start_date__lte=target_date, end_date__gte=target_date
        ).first()

        slots_info = []
        for slot in STANDARD_TIME_SLOTS:
            booked = Token.objects.filter(
                doctor=doctor, appointment_date=target_date, time_slot=slot
            ).exclude(status__in=['cancelled', 'skipped']).count()
            slots_info.append({
                "time_slot": slot,
                "booked_count": booked,
                "capacity": 4,
                "available": (not leave) and booked < 4,
            })

        return Response({
            "doctor_id": doctor.id,
            "date": target_date.isoformat(),
            "is_on_leave": leave is not None,
            "leave_reason": leave.reason if leave else None,
            "slots": slots_info,
        }, status=status.HTTP_200_OK)


class MyTokensView(APIView):
    """GET /api/opd/tokens/my-tokens/ -> List all OPD tokens for the logged-in patient."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: TokenSerializer(many=True)})
    def get(self, request):
        user = request.user
        if not hasattr(user, 'patient_profile'):
            return Response(
                {"detail": "Logged in user does not have a patient profile."},
                status=status.HTTP_400_BAD_REQUEST
            )

        tokens = Token.objects.filter(patient=user.patient_profile).select_related(
            'doctor', 'doctor__user', 'department'
        ).order_by('-appointment_date', '-token_number')

        active_only = request.query_params.get('active', 'false').lower() == 'true'
        if active_only:
            tokens = tokens.filter(status__in=['waiting', 'called', 'in_progress'])

        serializer = TokenSerializer(tokens, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TokenDetailView(generics.RetrieveAPIView):
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        token = get_object_or_404(
            Token.objects.select_related('patient__user', 'doctor', 'doctor__user', 'department'),
            pk=self.kwargs['pk']
        )
        user = self.request.user
        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if not hasattr(user, 'patient_profile') or token.patient_id != user.patient_profile.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You do not have permission to view another patient's token.")
        elif user.role not in ['doctor', 'reception', 'admin'] and not user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Not authorized to access OPD token details.")
        return token


class TokenListView(generics.ListAPIView):
    """GET /api/opd/tokens/ -> Today's (or ?date=) tokens with strict Anti-IDOR isolation."""

    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        date_str = self.request.query_params.get('date')
        target_date = timezone.now().date()
        if date_str:
            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        qs = Token.objects.filter(appointment_date=target_date).select_related(
            'patient__user', 'doctor__user', 'doctor__department', 'department'
        ).order_by('token_number')

        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if hasattr(user, 'patient_profile'):
                return qs.filter(patient=user.patient_profile)
            return qs.none()

        if user.role not in ['doctor', 'reception', 'admin'] and not user.is_staff:
            return qs.none()

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)

        return qs


class TokenCancelView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
    def post(self, request, pk):
        token = get_object_or_404(Token, pk=pk)

        if request.user.role == 'patient':
            if not hasattr(request.user, 'patient_profile') or token.patient != request.user.patient_profile:
                return Response(
                    {"detail": "You do not have permission to cancel this token."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif request.user.role not in ['reception', 'admin', 'doctor'] and not request.user.is_staff:
            return Response({"detail": "Not authorized to cancel tokens."}, status=status.HTTP_403_FORBIDDEN)

        if token.status != 'waiting':
            return Response(
                {"detail": f"Cannot cancel token with status '{token.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        token.status = 'cancelled'
        token.save()
        dispatch_queue_proximity_notifications(token.doctor, token.appointment_date)

        record_audit_log(
            request,
            action='UPDATE',
            resource_type='OPDTokenCancelled',
            resource_id=token.id,
            patient=token.patient,
            details=f"Token {token.token_code} cancelled.",
        )
        return Response({
            "message": f"Token {token.token_code} has been cancelled.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# DOCTOR QUEUE MANAGEMENT ENDPOINTS
# ─────────────────────────────────────────────
class DoctorQueueView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        user = request.user
        doctor = None

        if hasattr(user, 'doctor_profile'):
            doctor = user.doctor_profile
        elif (user.role == 'admin' or user.is_staff) and request.query_params.get('doctor_id'):
            doctor = get_object_or_404(Doctor, id=request.query_params.get('doctor_id'))
        else:
            return Response(
                {"detail": "Logged in user does not have a doctor profile."},
                status=status.HTTP_403_FORBIDDEN
            )

        today = timezone.now().date()
        queue, _ = Queue.objects.get_or_create(
            doctor=doctor,
            queue_date=today,
            defaults={
                'avg_consult_minutes': doctor.avg_consult_minutes or 15,
                'total_tokens': 0,
                'current_token': 0,
            }
        )

        all_today_tokens = Token.objects.filter(
            doctor=doctor, appointment_date=today
        ).select_related('patient', 'patient__user', 'department')

        current_called = all_today_tokens.filter(status__in=['called', 'in_progress']).first()
        waiting_list = all_today_tokens.filter(status='waiting').annotate(
            priority_rank=get_priority_order()
        ).order_by('priority_rank', 'token_number')
        completed_list = all_today_tokens.filter(status='completed').order_by('-updated_at')
        skipped_list = all_today_tokens.filter(status='skipped').order_by('-updated_at')

        return Response({
            "doctor": {
                "id": doctor.id,
                "doctor_name": f"Dr. {doctor.user.get_full_name() or doctor.user.username}",
                "department_name": doctor.department.name if doctor.department else 'General',
                "room_number": doctor.room_number or 'Room 101',
                "avg_consult_minutes": doctor.avg_consult_minutes or 15,
                "is_available": doctor.is_available,
            },
            "current_called_token": TokenSerializer(current_called).data if current_called else None,
            "waiting_list": TokenSerializer(waiting_list, many=True).data,
            "completed_list": TokenSerializer(completed_list, many=True).data,
            "skipped_list": TokenSerializer(skipped_list, many=True).data,
            "stats": {
                "total_today": all_today_tokens.count(),
                "waiting_count": waiting_list.count(),
                "completed_count": completed_list.count(),
                "skipped_count": skipped_list.count(),
                "current_serving_token_number": queue.current_token,
            }
        }, status=status.HTTP_200_OK)


class DoctorCallNextView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'token_id': {'type': 'integer'}}}}, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response({"detail": "Only doctors can call queue tokens."}, status=status.HTTP_403_FORBIDDEN)

        doctor = user.doctor_profile
        today = timezone.now().date()
        target_token_id = request.data.get('token_id')

        if target_token_id:
            next_token = Token.objects.filter(
                id=target_token_id,
                doctor=doctor,
                appointment_date=today,
                status__in=['waiting', 'skipped']
            ).first()
            if not next_token:
                return Response(
                    {"detail": "Selected token is not available in waiting or skipped queue."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            next_token = Token.objects.filter(
                doctor=doctor, appointment_date=today, status='waiting'
            ).annotate(priority_rank=get_priority_order()).order_by('priority_rank', 'token_number').first()

        if not next_token:
            return Response({"detail": "No patients currently waiting in queue."}, status=status.HTTP_404_NOT_FOUND)

        prev_called = Token.objects.filter(
            doctor=doctor, appointment_date=today, status='called'
        ).exclude(id=next_token.id).first()
        if prev_called:
            prev_called.status = 'completed'
            prev_called.save()

        next_token.status = 'called'
        next_token.save()

        queue, _ = Queue.objects.get_or_create(
            doctor=doctor,
            queue_date=today,
            defaults={'avg_consult_minutes': doctor.avg_consult_minutes or 15}
        )
        queue.current_token = next_token.token_number
        queue.save()

        sent_alerts = dispatch_queue_proximity_notifications(doctor, today)
        record_audit_log(
            request,
            action='UPDATE',
            resource_type='OPDCallNext',
            resource_id=next_token.id,
            patient=next_token.patient,
            details=f"Called token {next_token.token_code}; dispatched {len(sent_alerts)} proximity alerts.",
        )

        return Response({
            "message": f"Token {next_token.token_code} has been called into {doctor.room_number or 'the clinic'}!",
            "called_token": TokenSerializer(next_token).data,
            "current_token_number": queue.current_token,
            "notifications_triggered": len(sent_alerts),
        }, status=status.HTTP_200_OK)


class DoctorCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'token_id': {'type': 'integer'}}}}, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response({"detail": "Only doctors can complete consultations."}, status=status.HTTP_403_FORBIDDEN)

        doctor = user.doctor_profile
        today = timezone.now().date()
        token_id = request.data.get('token_id')

        if token_id:
            token = Token.objects.filter(id=token_id, doctor=doctor).first()
        else:
            token = Token.objects.filter(doctor=doctor, appointment_date=today, status='called').first()

        if not token:
            return Response({"detail": "No active called patient to complete."}, status=status.HTTP_400_BAD_REQUEST)

        token.status = 'completed'
        token.save()
        dispatch_queue_proximity_notifications(doctor, today)

        return Response({
            "message": f"Consultation for Token {token.token_code} marked as completed.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


class DoctorSkipView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'token_id': {'type': 'integer'}}}}, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response({"detail": "Only doctors can skip consultations."}, status=status.HTTP_403_FORBIDDEN)

        doctor = user.doctor_profile
        today = timezone.now().date()
        token_id = request.data.get('token_id')

        if token_id:
            token = Token.objects.filter(id=token_id, doctor=doctor).first()
        else:
            token = Token.objects.filter(doctor=doctor, appointment_date=today, status__in=['called', 'waiting']).first()

        if not token:
            return Response({"detail": "No patient found to skip."}, status=status.HTTP_400_BAD_REQUEST)

        token.status = 'skipped'
        token.save()
        dispatch_queue_proximity_notifications(doctor, today)

        return Response({
            "message": f"Token {token.token_code} marked as skipped.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# CLINICAL TV DISPLAY QUEUE (ROLE-PROTECTED + ZERO PII)
# ─────────────────────────────────────────────
class PublicDisplayQueueView(APIView):
    """
    GET /api/opd/public/display/<int:doctor_id>/
    Requires Doctor / Reception / Admin authentication and omits all patient PII.
    """

    permission_classes = [IsClinicalStaffOrAdmin]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request, doctor_id):
        doctor = get_object_or_404(
            Doctor.objects.select_related('user', 'department'),
            id=doctor_id
        )
        today = timezone.now().date()

        queue, _ = Queue.objects.get_or_create(
            doctor=doctor,
            queue_date=today,
            defaults={
                'avg_consult_minutes': doctor.avg_consult_minutes or 15,
                'total_tokens': 0,
                'current_token': 0,
            }
        )

        all_today_tokens = Token.objects.filter(
            doctor=doctor, appointment_date=today
        ).select_related('doctor', 'department')

        now_serving = all_today_tokens.filter(status__in=['called', 'in_progress']).first()
        next_5_tokens = all_today_tokens.filter(status='waiting').annotate(
            priority_rank=get_priority_order()
        ).order_by('priority_rank', 'token_number')[:5]

        return Response({
            "doctor": {
                "id": doctor.id,
                "name": f"Dr. {doctor.user.get_full_name() or doctor.user.username}",
                "department": doctor.department.name if doctor.department else "General OPD",
                "room_number": doctor.room_number or "Room 101",
                "avg_consult_minutes": doctor.avg_consult_minutes or 15,
                "is_available": doctor.is_available,
            },
            "now_serving": PublicDisplayTokenSerializer(now_serving).data if now_serving else None,
            "next_tokens": PublicDisplayTokenSerializer(next_5_tokens, many=True).data,
            "stats": {
                "current_token_number": queue.current_token,
                "waiting_count": all_today_tokens.filter(status='waiting').count(),
                "completed_count": all_today_tokens.filter(status='completed').count(),
                "total_today": all_today_tokens.count(),
            },
            "server_time": timezone.now().strftime("%H:%M:%S"),
            "server_date": today.strftime("%d %b %Y"),
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# NOTIFICATIONS ENDPOINTS (SMS / WhatsApp / In-App Queue Alerts)
# ─────────────────────────────────────────────
class MyNotificationsView(APIView):
    """GET /api/opd/notifications/ -> Patient views own alerts; Admin/Reception views recent dispatches."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: NotificationSerializer(many=True)})
    def get(self, request):
        user = request.user
        if user.role == 'patient':
            if not hasattr(user, 'patient_profile'):
                return Response([], status=status.HTTP_200_OK)
            qs = Notification.objects.filter(patient=user.patient_profile).select_related('token')
        elif user.role in ['admin', 'reception', 'doctor'] or user.is_staff:
            qs = Notification.objects.all().select_related('token', 'patient__user')
        else:
            qs = Notification.objects.none()

        channel = request.query_params.get('channel')
        if channel:
            qs = qs.filter(channel=channel)

        return Response(NotificationSerializer(qs[:50], many=True).data, status=status.HTTP_200_OK)


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
    def post(self, request, pk=None):
        user = request.user
        if not hasattr(user, 'patient_profile'):
            return Response({'detail': 'No notifications for non-patient account.'}, status=status.HTTP_400_BAD_REQUEST)

        if pk:
            notif = get_object_or_404(Notification, pk=pk)
            if notif.patient_id != user.patient_profile.id:
                return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
            notif.is_read = True
            notif.save()
        else:
            Notification.objects.filter(patient=user.patient_profile, is_read=False).update(is_read=True)

        return Response({'message': 'Marked as read.'}, status=status.HTTP_200_OK)
