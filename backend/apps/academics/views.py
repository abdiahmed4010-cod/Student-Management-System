"""
Views for Academics: Classrooms, Subjects, Teachers (Stage 3.8).
"""

from rest_framework import permissions, viewsets
from apps.accounts.permissions import HasModulePermission
from apps.accounts.rbac import get_scoped_classrooms_queryset
from apps.academics.models import Classroom, Subject, Teacher
from apps.academics.serializers import ClassroomSerializer, SubjectSerializer, TeacherSerializer


class ClassroomViewSet(viewsets.ModelViewSet):
    module_name = "classes"
    permission_classes = [HasModulePermission]
    serializer_class = ClassroomSerializer
    queryset = Classroom.objects.select_related("teacher").all()

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and user.role == "TEACHER":
            return get_scoped_classrooms_queryset(user)
        qs = super().get_queryset()
        academic_year = self.request.query_params.get("academic_year")
        if academic_year:
            qs = qs.filter(academic_year=academic_year)
        return qs


class SubjectViewSet(viewsets.ModelViewSet):
    module_name = "subjects"
    permission_classes = [HasModulePermission]
    serializer_class = SubjectSerializer
    queryset = Subject.objects.select_related("classroom").all()

    def get_queryset(self):
        qs = super().get_queryset()
        class_id = self.request.query_params.get("class_id") or self.request.query_params.get("classId")
        if class_id:
            qs = qs.filter(classroom_id=class_id)
        return qs


class TeacherViewSet(viewsets.ModelViewSet):
    module_name = "teachers"
    permission_classes = [HasModulePermission]
    serializer_class = TeacherSerializer
    queryset = Teacher.objects.prefetch_related("class_assignments", "subject_assignments").all()
