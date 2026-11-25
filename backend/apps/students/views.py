"""
Views for Student Registry (Stage 3.8).
"""

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasModulePermission
from apps.accounts.rbac import get_scoped_students_queryset
from apps.students.models import Student
from apps.students.serializers import StudentSerializer


class StudentViewSet(viewsets.ModelViewSet):
    module_name = "students"
    permission_classes = [HasModulePermission]
    serializer_class = StudentSerializer
    queryset = Student.objects.select_related("classroom").all()

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.role == "TEACHER":
            return get_scoped_students_queryset(user)
        qs = super().get_queryset()
        class_id = self.request.query_params.get("class_id") or self.request.query_params.get("classId")
        if class_id:
            qs = qs.filter(classroom_id=class_id)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(full_name__icontains=search)
        gender = self.request.query_params.get("gender")
        if gender:
            qs = qs.filter(gender=gender)
        return qs

    @action(detail=False, methods=["get"], url_path="next-id")
    def next_id(self, request):
        prefix = "STD-"
        last_student = (
            Student.objects.filter(admission_number__startswith=prefix)
            .order_by("-admission_number")
            .first()
        )
        if last_student:
            try:
                seq = int(last_student.admission_number.split("-")[-1]) + 1
            except Exception:
                seq = Student.objects.count() + 1
        else:
            seq = 1001
        return Response({"nextId": f"STD-{seq:04d}"})
