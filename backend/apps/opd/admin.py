from django.contrib import admin
from .models import Token, Queue, Notification

admin.site.register(Token)
admin.site.register(Queue)
admin.site.register(Notification)
