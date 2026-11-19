"""
apps/opd/views.py
==================
Views for OPD Token Generation and Patient Token Tracking.

Endpoints:
  - POST /api/opd/tokens/generate/    -> Generate new OPD Token (Patient or Reception)
  - GET  /api/opd/tokens/my-tokens/   -> List all tokens for logged-in Patient
  - GET  /api/opd/tokens/<id>/        -> Retrieve token details & real-time position
  - POST /api/opd/tokens/<id>/cancel/ -> Cancel a waiting token
"""

from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Token, Queue
from .serializers import TokenSerializer, TokenGenerateSerializer


class TokenGenerateView(APIView):
    """
    POST /api/opd/tokens/generate/
    Generates a new token for a chosen doctor.
    Expected Payload:
      {
        "doctor": 1,
        "priority": "normal" | "senior_citizen" | "emergency",
        "symptoms": "Headache and fever",
        "appointment_date": "2026-11-20" (optional, defaults to today)
      }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TokenGenerateSerializer(
            data=request.data,
            context={'request': request}
        )
        if serializer.is_valid():
            token = serializer.save()
            # Return detailed token view including room number and estimated wait
            return Response(
                TokenSerializer(token).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MyTokensView(APIView):
    """
    GET /api/opd/tokens/my-tokens/
    Returns all OPD tokens for the logged-in patient.
    Query parameters:
      ?active=true  -> Only return waiting and in_progress tokens
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

        # Filter by active only
        active_only = request.query_params.get('active', 'false').lower() == 'true'
        if active_only:
            tokens = tokens.filter(status__in=['waiting', 'in_progress'])

        serializer = TokenSerializer(tokens, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TokenDetailView(generics.RetrieveAPIView):
    """
    GET /api/opd/tokens/<id>/
    Fetches real-time status, room number, and wait time for a single token.
    """
    queryset = Token.objects.select_related('doctor', 'doctor__user', 'department').all()
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated]


class TokenCancelView(APIView):
    """
    POST /api/opd/tokens/<id>/cancel/
    Allows patient to cancel their own token before it is called.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        token = get_object_or_404(Token, pk=pk)

        # Check ownership: only the owner or staff can cancel
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
