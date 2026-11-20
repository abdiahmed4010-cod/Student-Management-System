"""
Student registry & promotion models for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.3)
- documentation/phase-2/DATA_DICTIONARY.md (Sections 2.8, 2.13)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
"""

import re
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class StudentQuerySet(models.QuerySet):
    def active(self):
        return self.filter(status="Active")

    def for_teacher(self, teacher_user):
        if teacher_user.role == "ADMIN":
            return self
        if teacher_user.teacher:
            assigned_class_ids = teacher_user.teacher.class_assignments.values_list(
                "classroom_id",
                flat=True,
            )
            return self.filter(
                models.Q(classroom__teacher=teacher_user.teacher)
                | models.Q(classroom_id__in=assigned_class_ids)
            ).distinct()
        return self.none()


class Student(models.Model):
    """
    Master Student Registry Model.
    Preserves the exact seven-field contract from Phase 1 plus the architectural
    lifecycle `status` extension.
    """

    GENDER_CHOICES = [
        ("Male", "Male"),
        ("Female", "Female"),
    ]
    STATUS_CHOICES = [
        ("Active", "Active"),
        ("Withdrawn", "Withdrawn"),
        ("Graduated", "Graduated"),
        ("Suspended", "Suspended"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission_number = models.CharField(max_length=36, unique=True)
    full_name = models.CharField(max_length=150, db_index=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    parent_phone = models.CharField(max_length=30, db_index=True)
    classroom = models.ForeignKey(
        "academics.Classroom",
        on_delete=models.RESTRICT,
        related_name="students",
        db_column="class_id",
    )
    registration_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Active",
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = StudentQuerySet.as_manager()

    class Meta:
        db_table = "studently_students"
        ordering = ["admission_number"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gender__in=["Male", "Female"]),
                name="chk_student_gender",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    status__in=["Active", "Withdrawn", "Graduated", "Suspended"]
                ),
                name="chk_student_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=["classroom", "status"],
                name="idx_student_class_status",
            ),
        ]

    def __str__(self):
        return f"{self.admission_number} — {self.full_name}"

    def clean(self):
        if not self.admission_number or not re.match(r"^STD-\d+$", self.admission_number):
            raise ValidationError(
                "Admission number must follow the format 'STD-XXXX'."
            )

    @classmethod
    def generate_next_admission_number(cls):
        max_num = 1000
        for adm in cls.objects.values_list("admission_number", flat=True):
            match = re.match(r"^STD-(\d+)$", adm)
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return f"STD-{max_num + 1}"


class PromotionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.RESTRICT,
        related_name="promotions",
        db_column="student_id",
    )
    previous_classroom = models.ForeignKey(
        "academics.Classroom",
        on_delete=models.RESTRICT,
        related_name="past_promotions",
        db_column="previous_class_id",
    )
    new_classroom = models.ForeignKey(
        "academics.Classroom",
        on_delete=models.RESTRICT,
        related_name="incoming_promotions",
        db_column="new_class_id",
    )
    academic_year = models.CharField(max_length=20, db_index=True)
    promoted_date = models.DateField()
    promoted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="promotions_authorized",
        db_column="promoted_by_user_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "studently_promotions"
        ordering = ["-promoted_date"]

    def __str__(self):
        return (
            f"{self.student.admission_number}: "
            f"{self.previous_classroom.name} -> {self.new_classroom.name} "
            f"({self.academic_year})"
        )
