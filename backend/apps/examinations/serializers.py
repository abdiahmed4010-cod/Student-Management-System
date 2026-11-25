"""
Serializers for Examinations and Marks (Stage 3.8).
"""

from rest_framework import serializers
from apps.examinations.models import Examination, ExaminationMark, ExaminationStudentSummary


class ExaminationMarkSerializer(serializers.ModelSerializer):
    student_admission_number = serializers.ReadOnlyField(source="student.admission_number")
    student_name = serializers.ReadOnlyField(source="student.full_name")
    subject_name = serializers.ReadOnlyField(source="subject.name")

    class Meta:
        model = ExaminationMark
        fields = [
            "id",
            "examination",
            "student",
            "student_admission_number",
            "student_name",
            "subject",
            "subject_name",
            "score",
            "recorded_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["studentId"] = str(instance.student_id)
        ret["subjectId"] = str(instance.subject_id)
        ret["score"] = float(instance.score)
        return ret


class ExaminationSerializer(serializers.ModelSerializer):
    classroom_name = serializers.ReadOnlyField(source="classroom.name")
    marks = ExaminationMarkSerializer(many=True, read_only=True)

    class Meta:
        model = Examination
        fields = [
            "id",
            "classroom",
            "classroom_name",
            "exam_type",
            "academic_year",
            "term",
            "recorded_date",
            "marks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["classId"] = str(instance.classroom_id)
        ret["examType"] = instance.exam_type
        ret["academicYear"] = instance.academic_year
        ret["recordedDate"] = str(instance.recorded_date)
        return ret
