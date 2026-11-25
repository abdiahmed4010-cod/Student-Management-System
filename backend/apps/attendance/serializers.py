"""
Serializers for Attendance Module (Stage 3.8).
"""

from rest_framework import serializers
from apps.attendance.models import AttendanceRecord


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.ReadOnlyField(source="student.full_name")
    student_admission_number = serializers.ReadOnlyField(source="student.admission_number")
    classroom_name = serializers.ReadOnlyField(source="classroom.name")

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "student",
            "student_name",
            "student_admission_number",
            "classroom",
            "classroom_name",
            "teacher",
            "date",
            "status",
            "excused_reason",
            "recorded_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recorded_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["studentId"] = str(instance.student_id)
        ret["classId"] = str(instance.classroom_id)
        ret["excusedReason"] = ret.get("excused_reason")
        return ret
