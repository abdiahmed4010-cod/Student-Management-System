"""
Serializers for Student Registry (Stage 3.8).
"""

from rest_framework import serializers
from apps.students.models import Student


class StudentSerializer(serializers.ModelSerializer):
    class_name = serializers.ReadOnlyField(source="classroom.name")

    class Meta:
        model = Student
        fields = [
            "id",
            "admission_number",
            "full_name",
            "gender",
            "date_of_birth",
            "parent_phone",
            "classroom",
            "class_name",
            "registration_date",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Compatibility aliases for frontend
        ret["fullName"] = ret.get("full_name")
        ret["dateOfBirth"] = ret.get("date_of_birth")
        ret["parentPhone"] = ret.get("parent_phone")
        ret["classId"] = str(instance.classroom_id) if instance.classroom_id else None
        ret["registrationDate"] = ret.get("registration_date")
        ret["studentId"] = instance.admission_number
        return ret
