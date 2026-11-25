"""
Serializers for Academics: Classrooms, Subjects, Teachers (Stage 3.8).
"""

from django.db import transaction
from rest_framework import serializers
from apps.academics.models import (
    Classroom,
    Subject,
    Teacher,
    TeacherClassAssignment,
    TeacherSubjectAssignment,
)


class ClassroomSerializer(serializers.ModelSerializer):
    teacher_name = serializers.ReadOnlyField(source="teacher.full_name")

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "section",
            "room",
            "capacity",
            "academic_year",
            "teacher",
            "teacher_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["academicYear"] = ret.get("academic_year")
        ret["teacherId"] = str(instance.teacher_id) if instance.teacher_id else None
        return ret


class SubjectSerializer(serializers.ModelSerializer):
    classroom_name = serializers.ReadOnlyField(source="classroom.name")

    class Meta:
        model = Subject
        fields = [
            "id",
            "classroom",
            "classroom_name",
            "name",
            "code",
            "max_marks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["classId"] = str(instance.classroom_id) if instance.classroom_id else None
        ret["maxMarks"] = ret.get("max_marks")
        return ret


class TeacherSerializer(serializers.ModelSerializer):
    assigned_class_ids = serializers.PrimaryKeyRelatedField(
        queryset=Classroom.objects.all(), many=True, required=False, write_only=True
    )
    assigned_subject_ids = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.all(), many=True, required=False, write_only=True
    )

    class Meta:
        model = Teacher
        fields = [
            "id",
            "full_name",
            "email",
            "phone",
            "account_status",
            "specialization",
            "joined_date",
            "assigned_class_ids",
            "assigned_subject_ids",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_assigned_class_ids(self, obj):
        return [str(cid) for cid in obj.class_assignments.values_list("classroom_id", flat=True)]

    def get_assigned_subject_ids(self, obj):
        return [str(sid) for sid in obj.subject_assignments.values_list("subject_id", flat=True)]

    @transaction.atomic
    def create(self, validated_data):
        classrooms = validated_data.pop("assigned_class_ids", [])
        subjects = validated_data.pop("assigned_subject_ids", [])
        teacher = Teacher.objects.create(**validated_data)
        from apps.academics.models import TeacherClassAssignment, TeacherSubjectAssignment

        TeacherClassAssignment.objects.bulk_create(
            [TeacherClassAssignment(teacher=teacher, classroom=classroom) for classroom in classrooms]
        )
        TeacherSubjectAssignment.objects.bulk_create(
            [TeacherSubjectAssignment(teacher=teacher, subject=subject) for subject in subjects]
        )
        return teacher

    @transaction.atomic
    def update(self, instance, validated_data):
        classrooms = validated_data.pop("assigned_class_ids", None)
        subjects = validated_data.pop("assigned_subject_ids", None)
        teacher = super().update(instance, validated_data)
        from apps.academics.models import TeacherClassAssignment, TeacherSubjectAssignment

        if classrooms is not None:
            TeacherClassAssignment.objects.filter(teacher=teacher).delete()
            TeacherClassAssignment.objects.bulk_create(
                [TeacherClassAssignment(teacher=teacher, classroom=classroom) for classroom in classrooms]
            )
        if subjects is not None:
            TeacherSubjectAssignment.objects.filter(teacher=teacher).delete()
            TeacherSubjectAssignment.objects.bulk_create(
                [TeacherSubjectAssignment(teacher=teacher, subject=subject) for subject in subjects]
            )
        return teacher

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["assigned_class_ids"] = self.get_assigned_class_ids(instance)
        ret["assigned_subject_ids"] = self.get_assigned_subject_ids(instance)
        ret["fullName"] = ret.get("full_name")
        ret["accountStatus"] = ret.get("account_status")
        ret["assignedClassIds"] = self.get_assigned_class_ids(instance)
        ret["assignedSubjectIds"] = self.get_assigned_subject_ids(instance)
        return ret
