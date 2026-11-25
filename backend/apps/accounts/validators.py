"""
apps/accounts/validators.py
===========================
Custom strong password validator for SmartCare real accounts.
Requires minimum 8 characters with uppercase, lowercase, and digit/special char.
"""

import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class StrongPasswordValidator:
    """Enforce complexity: uppercase, lowercase, and at least one number or symbol."""

    def validate(self, password, user=None):
        if len(password) < 8:
            raise ValidationError(
                _("Password must be at least 8 characters long."),
                code="password_too_short",
            )
        if not re.search(r"[A-Z]", password):
            raise ValidationError(
                _("Password must contain at least one uppercase letter (A-Z)."),
                code="password_no_upper",
            )
        if not re.search(r"[a-z]", password):
            raise ValidationError(
                _("Password must contain at least one lowercase letter (a-z)."),
                code="password_no_lower",
            )
        if not re.search(r"[\d!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\\/~`]", password):
            raise ValidationError(
                _("Password must contain at least one number or special character."),
                code="password_no_digit_or_symbol",
            )

    def get_help_text(self):
        return _(
            "Your password must be at least 8 characters long and include uppercase, "
            "lowercase, and a number or special character."
        )
