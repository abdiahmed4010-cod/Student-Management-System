"""
Academics & faculty models for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.2)
- documentation/phase-2/DATA_DICTIONARY.md (Sections 2.3–2.7)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
"""

import uuid

from django.core.validators import MinValueValidator
from django.db import models


class Teacher(models.Model):
    STATUS_CHOICES = [
        ("Active", "Active"),
        ("Deactivated", "Deactivated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True, max_length=254)
    phone = models.CharField(max_length=30)
    account_status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Active",
    )
    specialization = models.CharField(max_length=150, null=True, blank=True)
    joined_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_teachers"
        ordering = ["full_name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(account_status__in=["Active", "Deactivated"]),
                name="chk_teacher_account_status",
            ),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.email})"


class Classroom(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    section = models.CharField(max_length=20, default="A")
    room = models.CharField(max_length=50, null=True, blank=True)
    capacity = models.PositiveIntegerField(default=30, validators=[MinValueValidator(1)])
    academic_year = models.CharField(max_length=20, default="2026-2027", db_index=True)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homeroom_classes",
        db_column="teacher_id",
        help_text=(
            "Assigned homeroom teacher (administrative/pastoral lead). "
            "Does not restrict multi-teacher co-teaching."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_classes"
        ordering = ["name", "section"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "section", "academic_year"],
                name="unique_class_section_year",
            ),
            models.CheckConstraint(
                condition=models.Q(capacity__gt=0),
                name="chk_class_capacity",
            ),
        ]

    def __str__(self):
        return f"{self.name} - Section {self.section} ({self.academic_year})"


class Subject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.RESTRICT,
        related_name="subjects",
        db_column="class_id",
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, null=True, blank=True)
    max_marks = models.PositiveIntegerField(default=100, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_subjects"
        ordering = ["classroom", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["classroom", "code"],
                name="unique_class_subject_code",
            ),
            models.CheckConstraint(
                condition=models.Q(max_marks__gt=0),
                name="chk_subject_max_marks",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.code or 'No Code'}) - {self.classroom.name}"


class TeacherClassAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.CASCADE,
        related_name="class_assignments",
        db_column="teacher_id",
    )
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name="teacher_assignments",
        db_column="class_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "studently_teacher_class_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "classroom"],
                name="unique_teacher_class_assignment",
            ),
        ]

    def __str__(self):
        return f"{self.teacher.full_name} -> {self.classroom.name}"


class TeacherSubjectAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.CASCADE,
        related_name="subject_assignments",
        db_column="teacher_id",
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name="teacher_assignments",
        db_column="subject_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "studently_teacher_subject_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["teacher", "subject"],
                name="unique_teacher_subject_assignment",
            ),
        ]

    def __str__(self):
        return f"{self.teacher.full_name} -> {self.subject.name}"
