"""
apps/opd/views.py
==================
Views for OPD Token Generation, Patient Token Tracking,
and Doctor Live Queue Management (Call Next, Skip, Complete).

Endpoints:
  - POST /api/opd/tokens/generate/    -> Generate new OPD Token (Patient or Reception)
  - GET  /api/opd/tokens/my-tokens/   -> List all tokens for logged-in Patient
  - GET  /api/opd/tokens/<id>/        -> Retrieve token details & real-time position
  - POST /api/opd/tokens/<id>/cancel/ -> Cancel a waiting token

  - GET  /api/opd/doctor/queue/       -> Doctor: view today's waiting list in priority order
  - POST /api/opd/doctor/call-next/   -> Doctor: call next waiting patient (status -> Called)
  - POST /api/opd/doctor/complete/    -> Doctor: complete consultation (status -> Completed)
  - POST /api/opd/doctor/skip/        -> Doctor: skip absent patient (status -> Skipped)
"""

from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Case, When, Value, IntegerField

from .models import Token, Queue
from .serializers import TokenSerializer, TokenGenerateSerializer
from apps.accounts.models import Doctor


# Helper: Priority annotation for sorting queue
def get_priority_order():
    return Case(
        When(priority='emergency', then=Value(1)),
        When(priority='senior_citizen', then=Value(2)),
        When(priority='normal', then=Value(3)),
        default=Value(4),
        output_field=IntegerField(),
    )


class TokenGenerateView(APIView):
    """
    POST /api/opd/tokens/generate/
    Generates a new token for a chosen doctor.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TokenGenerateSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            token = serializer.save()
            return Response(
                TokenSerializer(token).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MyTokensView(APIView):
    """
    GET /api/opd/tokens/my-tokens/
    Returns all OPD tokens for the logged-in patient.
    """
    permission_classes = [IsAuthenticated]

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
    queryset = Token.objects.select_related('doctor', 'doctor__user', 'department').all()
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]


class TokenListView(generics.ListAPIView):
    """
    GET /api/opd/tokens/
    Lists today's tokens with optional filters: ?status=waiting&doctor=1
    Used for cross-module integration (e.g. Bed module selecting an OPD patient to admit).
    """
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = timezone.now().date()
        qs = Token.objects.filter(appointment_date=today).select_related(
            'patient__user', 'doctor__user', 'doctor__department', 'department'
        ).order_by('token_number')

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)

        return qs


class TokenCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        token = get_object_or_404(Token, pk=pk)

        if request.user.role == 'patient':
            if not hasattr(request.user, 'patient_profile') or token.patient != request.user.patient_profile:
                return Response(
                    {"detail": "You do not have permission to cancel this token."},
                    status=status.HTTP_403_FORBIDDEN
                )

        if token.status != 'waiting':
            return Response(
                {"detail": f"Cannot cancel token with status '{token.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        token.status = 'cancelled'
        token.save()

        return Response({
            "message": f"Token {token.token_code} has been cancelled.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# DOCTOR QUEUE MANAGEMENT ENDPOINTS
# ─────────────────────────────────────────────

class DoctorQueueView(APIView):
    """
    GET /api/opd/doctor/queue/
    Returns today's live queue for the logged-in Doctor:
      - Currently called patient
      - Waiting list in priority order (Emergency -> Senior Citizen -> Normal, then token_number)
      - Completed list
      - Skipped list
      - Queue statistics
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        doctor = None

        if hasattr(user, 'doctor_profile'):
            doctor = user.doctor_profile
        elif user.role == 'admin' and request.query_params.get('doctor_id'):
            doctor = get_object_or_404(Doctor, id=request.query_params.get('doctor_id'))
        else:
            return Response(
                {"detail": "Logged in user does not have a doctor profile."},
                status=status.HTTP_403_FORBIDDEN
            )

        today = timezone.now().date()

        # Doctor's daily Queue record
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
            doctor=doctor,
            appointment_date=today
        ).select_related('patient', 'patient__user', 'department')

        # 1. Currently called patient
        current_called = all_today_tokens.filter(status__in=['called', 'in_progress']).first()

        # 2. Waiting list in strict priority order:
        # Emergency (1) -> Senior Citizen (2) -> Normal (3), then sequential token_number
        waiting_list = all_today_tokens.filter(status='waiting').annotate(
            priority_rank=get_priority_order()
        ).order_by('priority_rank', 'token_number')

        # 3. Completed list
        completed_list = all_today_tokens.filter(status='completed').order_by('-updated_at')

        # 4. Skipped list
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
    """
    POST /api/opd/doctor/call-next/
    Calls the next patient in the waiting list:
      1. If a previous token was 'called', auto-completes it.
      2. Selects the highest priority next waiting patient.
      3. Sets next token status to 'called'.
      4. Updates Queue.current_token = next_token.token_number.
      5. Broadcasts the current token update to all patients.
    Optional payload: { "token_id": 5 } to specifically call a selected token.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response(
                {"detail": "Only doctors can call queue tokens."},
                status=status.HTTP_403_FORBIDDEN
            )

        doctor = user.doctor_profile
        today = timezone.now().date()

        # Check if doctor specifically chose a token ID to call
        target_token_id = request.data.get('token_id')
        next_token = None

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
            # Pick highest priority waiting token
            next_token = Token.objects.filter(
                doctor=doctor,
                appointment_date=today,
                status='waiting'
            ).annotate(
                priority_rank=get_priority_order()
            ).order_by('priority_rank', 'token_number').first()

        if not next_token:
            return Response(
                {"detail": "No patients currently waiting in queue."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Auto-complete previously called token if doctor didn't explicitly complete it
        prev_called = Token.objects.filter(
            doctor=doctor,
            appointment_date=today,
            status='called'
        ).exclude(id=next_token.id).first()

        if prev_called:
            prev_called.status = 'completed'
            prev_called.save()

        # Update next token to 'called'
        next_token.status = 'called'
        next_token.save()

        # Update Queue.current_token (updates queue board for all patients!)
        queue, _ = Queue.objects.get_or_create(
            doctor=doctor,
            queue_date=today,
            defaults={'avg_consult_minutes': doctor.avg_consult_minutes or 15}
        )
        queue.current_token = next_token.token_number
        queue.save()

        return Response({
            "message": f"Token {next_token.token_code} has been called into {doctor.room_number or 'the clinic'}!",
            "called_token": TokenSerializer(next_token).data,
            "current_token_number": queue.current_token,
        }, status=status.HTTP_200_OK)


class DoctorCompleteView(APIView):
    """
    POST /api/opd/doctor/complete/
    Marks the currently called patient (or specified token) as 'completed'.
    Payload (optional): { "token_id": 5 }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response(
                {"detail": "Only doctors can complete consultations."},
                status=status.HTTP_403_FORBIDDEN
            )

        doctor = user.doctor_profile
        today = timezone.now().date()

        token_id = request.data.get('token_id')
        if token_id:
            token = Token.objects.filter(id=token_id, doctor=doctor).first()
        else:
            token = Token.objects.filter(doctor=doctor, appointment_date=today, status='called').first()

        if not token:
            return Response(
                {"detail": "No active called patient to complete."},
                status=status.HTTP_400_BAD_REQUEST
            )

        token.status = 'completed'
        token.save()

        return Response({
            "message": f"Consultation for Token {token.token_code} marked as completed.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


class DoctorSkipView(APIView):
    """
    POST /api/opd/doctor/skip/
    Marks the currently called patient (or specified token) as 'skipped'
    when the patient is absent or not responding.
    Payload (optional): { "token_id": 5 }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not hasattr(user, 'doctor_profile'):
            return Response(
                {"detail": "Only doctors can skip consultations."},
                status=status.HTTP_403_FORBIDDEN
            )

        doctor = user.doctor_profile
        today = timezone.now().date()

        token_id = request.data.get('token_id')
        if token_id:
            token = Token.objects.filter(id=token_id, doctor=doctor).first()
        else:
            token = Token.objects.filter(doctor=doctor, appointment_date=today, status__in=['called', 'waiting']).first()

        if not token:
            return Response(
                {"detail": "No patient found to skip."},
                status=status.HTTP_400_BAD_REQUEST
            )

        token.status = 'skipped'
        token.save()

        return Response({
            "message": f"Token {token.token_code} marked as skipped.",
            "token": TokenSerializer(token).data
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# PUBLIC DISPLAY SCREEN (FOR TV MONITORS / WAITING LOUNGE)
# ─────────────────────────────────────────────

class PublicDisplayQueueView(APIView):
    """
    GET /api/opd/public/display/<int:doctor_id>/
    Public endpoint for waiting lounge TV monitors.
    Requires NO authentication.
    Returns:
      - Doctor details & Clinic Room
      - Now Serving token (status='called')
      - Next 5 waiting tokens in strict priority order
      - Today's queue statistics
    """
    permission_classes = [permissions.AllowAny]

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
            doctor=doctor,
            appointment_date=today
        ).select_related('patient', 'patient__user', 'department')

        # Now Serving Token (called into room)
        now_serving = all_today_tokens.filter(status__in=['called', 'in_progress']).first()

        # Next 5 Waiting Tokens (priority order: Emergency -> Senior Citizen -> Normal)
        next_5_tokens = all_today_tokens.filter(status='waiting').annotate(
            priority_rank=get_priority_order()
        ).order_by('priority_rank', 'token_number')[:5]

        waiting_count = all_today_tokens.filter(status='waiting').count()
        completed_count = all_today_tokens.filter(status='completed').count()

        return Response({
            "doctor": {
                "id": doctor.id,
                "name": f"Dr. {doctor.user.get_full_name() or doctor.user.username}",
                "department": doctor.department.name if doctor.department else "General OPD",
                "room_number": doctor.room_number or "Room 101",
                "avg_consult_minutes": doctor.avg_consult_minutes or 15,
                "is_available": doctor.is_available,
            },
            "now_serving": TokenSerializer(now_serving).data if now_serving else None,
            "next_tokens": TokenSerializer(next_5_tokens, many=True).data,
            "stats": {
                "current_token_number": queue.current_token,
                "waiting_count": waiting_count,
                "completed_count": completed_count,
                "total_today": all_today_tokens.count(),
            },
            "server_time": timezone.now().strftime("%H:%M:%S"),
            "server_date": today.strftime("%d %b %Y"),
        }, status=status.HTTP_200_OK)
