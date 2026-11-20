"""
Examinations & normalized relational marks models for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.5)
- documentation/phase-2/DATA_DICTIONARY.md (Sections 2.10–2.12)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
"""

import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Examination(models.Model):
    EXAM_TYPE_CHOICES = [
        ("Midterm", "Midterm Examination"),
        ("Final", "Final Examination"),
    ]
    TERM_CHOICES = [
        ("Term 1", "Term 1"),
        ("Term 2", "Term 2"),
        ("Term 3", "Term 3"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    classroom = models.ForeignKey(
        "academics.Classroom",
        on_delete=models.RESTRICT,
        related_name="examinations",
        db_column="class_id",
    )
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES)
    academic_year = models.CharField(max_length=20, db_index=True)
    term = models.CharField(max_length=20, choices=TERM_CHOICES)
    recorded_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_examinations"
        ordering = ["-academic_year", "term", "exam_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["classroom", "exam_type", "academic_year", "term"],
                name="unique_class_exam_session",
            ),
            models.CheckConstraint(
                condition=models.Q(exam_type__in=["Midterm", "Final"]),
                name="chk_exam_type",
            ),
            models.CheckConstraint(
                condition=models.Q(term__in=["Term 1", "Term 2", "Term 3"]),
                name="chk_exam_term",
            ),
        ]
        indexes = [
            models.Index(
                fields=["classroom", "academic_year"],
                name="idx_exam_class_year",
            ),
        ]

    def __str__(self):
        return f"{self.classroom.name} — {self.exam_type} ({self.term} {self.academic_year})"


class ExaminationStudentSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    examination = models.ForeignKey(
        Examination,
        on_delete=models.CASCADE,
        related_name="student_summaries",
        db_column="examination_id",
    )
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.RESTRICT,
        related_name="exam_summaries",
        db_column="student_id",
    )
    activity_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    total_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_examination_student_summaries"
        constraints = [
            models.UniqueConstraint(
                fields=["examination", "student"],
                name="unique_exam_student_summary",
            ),
            models.CheckConstraint(
                condition=models.Q(activity_score__gte=Decimal("0.00"))
                | models.Q(activity_score__isnull=True),
                name="chk_activity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(total_score__gte=Decimal("0.00")),
                name="chk_total_positive",
            ),
        ]

    def __str__(self):
        return f"{self.examination} — {self.student.admission_number}: {self.total_score}"


class ExaminationMark(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    examination = models.ForeignKey(
        Examination,
        on_delete=models.CASCADE,
        related_name="marks",
        db_column="examination_id",
    )
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.RESTRICT,
        related_name="exam_marks",
        db_column="student_id",
    )
    subject = models.ForeignKey(
        "academics.Subject",
        on_delete=models.RESTRICT,
        related_name="exam_marks",
        db_column="subject_id",
    )
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    recorded_by = models.ForeignKey(
        "academics.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="marks_entered",
        db_column="recorded_by_teacher_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_examination_marks"
        ordering = ["examination", "student", "subject"]
        constraints = [
            models.UniqueConstraint(
                fields=["examination", "student", "subject"],
                name="unique_exam_student_subject_mark",
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=Decimal("0.00")),
                name="chk_mark_score_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["examination", "subject"],
                name="idx_marks_exam_subject",
            ),
        ]

    def __str__(self):
        return f"{self.student.admission_number} — {self.subject.name}: {self.score}"

    def clean(self):
        if self.score is not None and self.subject_id and self.score > self.subject.max_marks:
            raise ValidationError(
                f"Score ({self.score}) exceeds maximum marks for "
                f"{self.subject.name} ({self.subject.max_marks})."
            )
