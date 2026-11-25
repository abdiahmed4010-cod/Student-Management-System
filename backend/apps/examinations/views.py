"""
Views for Examinations and Marks (Stage 3.8).
"""

from decimal import Decimal
from django.db import models, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import Classroom, Subject
from apps.accounts.permissions import HasModulePermission
from apps.examinations.models import Examination, ExaminationMark
from apps.examinations.serializers import ExaminationMarkSerializer, ExaminationSerializer
from apps.students.models import Student


class ExaminationViewSet(viewsets.ModelViewSet):
    module_name = "examinations"
    permission_classes = [HasModulePermission]
    serializer_class = ExaminationSerializer
    queryset = Examination.objects.select_related("classroom").prefetch_related("marks__student", "marks__subject").all()

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == "TEACHER":
            teacher = getattr(self.request.user, "teacher", None)
            if not teacher:
                return qs.none()
            qs = qs.filter(
                Q(classroom__teacher=teacher)
                | Q(classroom__teacher_assignments__teacher=teacher)
            ).distinct().prefetch_related(None).prefetch_related(
                Prefetch(
                    "marks",
                    queryset=ExaminationMark.objects.filter(
                        subject__teacher_assignments__teacher=teacher
                    ).select_related("student", "subject"),
                )
            )
        class_id = self.request.query_params.get("class_id") or self.request.query_params.get("classId")
        if class_id:
            qs = qs.filter(classroom_id=class_id)
        exam_type = self.request.query_params.get("exam_type") or self.request.query_params.get("examType")
        if exam_type:
            qs = qs.filter(exam_type=exam_type)
        academic_year = self.request.query_params.get("academic_year") or self.request.query_params.get("academicYear")
        if academic_year:
            qs = qs.filter(academic_year=academic_year)
        term = self.request.query_params.get("term")
        if term:
            qs = qs.filter(term=term)
        return qs

    @action(detail=False, methods=["post"], url_path="save-marks")
    def save_marks(self, request):
        class_id = request.data.get("classId")
        exam_type = request.data.get("examType", "Midterm")
        academic_year = request.data.get("academicYear", "2026-2027")
        term = request.data.get("term", "Term 1")
        marks_data = request.data.get("marks", {})

        if not class_id:
            return Response({"error": "classId is required"}, status=status.HTTP_400_BAD_REQUEST)

        classroom = Classroom.objects.filter(id=class_id).first()
        if not classroom:
            return Response({"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND)

        teacher_obj = getattr(request.user, "teacher", None)

        with transaction.atomic():
            exam, _ = Examination.objects.get_or_create(
                classroom=classroom,
                exam_type=exam_type,
                academic_year=academic_year,
                term=term,
                defaults={"recorded_date": timezone.now().date()},
            )

            saved_marks = 0
            for student_id, subjects_map in marks_data.items():
                student = (
                    Student.objects.filter(id=student_id).first()
                    or Student.objects.filter(admission_number=student_id).first()
                )
                if not student:
                    continue

                for subject_id, score in subjects_map.items():
                    subject = Subject.objects.filter(id=subject_id).first()
                    if not subject:
                        continue

                    score_val = Decimal(str(score))
                    mark_obj, created = ExaminationMark.objects.update_or_create(
                        examination=exam,
                        student=student,
                        subject=subject,
                        defaults={
                            "score": score_val,
                            "recorded_by": teacher_obj,
                        },
                    )
                    saved_marks += 1

        return Response({"success": True, "recordId": str(exam.id), "savedMarks": saved_marks})

    @action(detail=False, methods=["get"], url_path="historical")
    def historical(self, request):
        student_id = request.query_params.get("student_id") or request.query_params.get("studentId")
        class_id = request.query_params.get("class_id") or request.query_params.get("classId")
        marks_qs = ExaminationMark.objects.select_related("examination", "subject", "student").all()
        if student_id:
            marks_qs = marks_qs.filter(models.Q(student_id=student_id) | models.Q(student__admission_number=student_id))
        if class_id:
            marks_qs = marks_qs.filter(examination__classroom_id=class_id)

        serializer = ExaminationMarkSerializer(marks_qs, many=True)
        return Response(serializer.data)
