"""
Daily attendance model for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.4)
- documentation/phase-2/DATA_DICTIONARY.md (Section 2.9: studently_attendance)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
"""

import uuid

from django.core.exceptions import ValidationError
from django.db import models


class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ("Present", "Present"),
        ("Absent", "Absent"),
        ("Excused", "Excused"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.RESTRICT,
        related_name="attendance_records",
        db_column="student_id",
    )
    classroom = models.ForeignKey(
        "academics.Classroom",
        on_delete=models.RESTRICT,
        related_name="attendance_records",
        db_column="class_id",
    )
    teacher = models.ForeignKey(
        "academics.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_marked",
        db_column="teacher_id",
    )
    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Present",
    )
    excused_reason = models.TextField(null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_attendance"
        ordering = ["-date", "student__full_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "date"],
                name="unique_student_daily_attendance",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["Present", "Absent", "Excused"]),
                name="chk_attendance_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=["classroom", "date"],
                name="idx_attendance_class_date",
            ),
        ]

    def __str__(self):
        return f"{self.student.admission_number} — {self.date} [{self.status}]"

    def clean(self):
        if self.status == "Excused" and not (
            self.excused_reason and self.excused_reason.strip()
        ):
            raise ValidationError("Excused attendance must include a valid reason.")
