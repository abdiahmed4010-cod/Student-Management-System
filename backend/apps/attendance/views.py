"""
Views for Attendance Module (Stage 3.8).
"""

from django.db import models, transaction
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import Classroom
from apps.accounts.permissions import HasModulePermission
from apps.attendance.models import AttendanceRecord
from apps.attendance.serializers import AttendanceRecordSerializer
from apps.students.models import Student


class AttendanceViewSet(viewsets.ModelViewSet):
    module_name = "attendance"
    permission_classes = [HasModulePermission]
    serializer_class = AttendanceRecordSerializer
    queryset = AttendanceRecord.objects.select_related("student", "classroom", "teacher").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == "TEACHER":
            teacher = getattr(self.request.user, "teacher", None)
            if not teacher:
                return qs.none()
            qs = qs.filter(
                Q(classroom__teacher=teacher)
                | Q(classroom__teacher_assignments__teacher=teacher)
            ).distinct()
        class_id = self.request.query_params.get("class_id") or self.request.query_params.get("classId")
        if class_id:
            qs = qs.filter(classroom_id=class_id)
        date = self.request.query_params.get("date")
        if date:
            qs = qs.filter(date=date)
        student_id = self.request.query_params.get("student_id") or self.request.query_params.get("studentId")
        if student_id:
            qs = qs.filter(student_id=student_id)
        return qs

    @action(detail=False, methods=["post"], url_path="batch")
    def batch(self, request):
        class_id = request.data.get("classId")
        date = request.data.get("date")
        status_map = request.data.get("studentStatusMap", {})

        if not class_id or not date:
            return Response({"error": "classId and date are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Teachers cannot submit 'Excused' status directly (Admin privilege)
        if request.user.role == "TEACHER":
            for s_id, stat in status_map.items():
                if stat == "Excused":
                    return Response(
                        {"error": "Teachers are not authorized to mark attendance as Excused."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        teacher_obj = getattr(request.user, "teacher", None)

        with transaction.atomic():
            saved_count = 0
            for student_id, stat in status_map.items():
                student = (
                    Student.objects.filter(id=student_id).first()
                    or Student.objects.filter(admission_number=student_id).first()
                )
                if not student:
                    continue

                AttendanceRecord.objects.update_or_create(
                    student=student,
                    date=date,
                    defaults={
                        "classroom_id": class_id,
                        "status": stat,
                        "teacher": teacher_obj,
                    },
                )
                saved_count += 1

        return Response({"success": True, "count": saved_count})

    @action(detail=False, methods=["get"], url_path="sessions")
    def sessions(self, request):
        qs = self.get_queryset()
        sessions_map = {}
        for rec in qs:
            key = f"{rec.classroom_id}_{rec.date}"
            if key not in sessions_map:
                sessions_map[key] = {
                    "classId": str(rec.classroom_id),
                    "className": rec.classroom.name if rec.classroom else "",
                    "date": str(rec.date),
                    "totalStudents": 0,
                    "presentCount": 0,
                    "absentCount": 0,
                    "excusedCount": 0,
                }
            sessions_map[key]["totalStudents"] += 1
            if rec.status == "Present":
                sessions_map[key]["presentCount"] += 1
            elif rec.status == "Absent":
                sessions_map[key]["absentCount"] += 1
            elif rec.status == "Excused":
                sessions_map[key]["excusedCount"] += 1

        return Response(list(sessions_map.values()))
