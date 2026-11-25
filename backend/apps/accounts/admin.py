from django.contrib import admin
from .models import User, Department, Doctor, DoctorLeave, DoctorFeedback, Patient, AuditLog

admin.site.register(User)
admin.site.register(Department)
admin.site.register(Doctor)
admin.site.register(DoctorLeave)
admin.site.register(DoctorFeedback)
admin.site.register(Patient)
admin.site.register(AuditLog)
