"""
Automated model, queryset, constraint, and FK tests for apps.students,
apps.attendance, and apps.examinations.
"""

import datetime
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import RestrictedError
from django.test import TestCase

from apps.academics.models import Classroom, Subject, Teacher, TeacherClassAssignment
from apps.attendance.models import AttendanceRecord
from apps.examinations.models import (
    Examination,
    ExaminationMark,
    ExaminationStudentSummary,
)
from apps.students.models import PromotionHistory, Student

User = get_user_model()


class StudentsAttendanceExaminationsTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            email="registrar@studently.edu",
            password="Str0ng!AdminPass#2026",
            full_name="Academic Registrar",
            role="ADMIN",
        )
        self.teacher = Teacher.objects.create(
            full_name="Fatima Omar",
            email="fatima.omar@studently.edu",
            phone="063-4112233",
            joined_date=datetime.date(2025, 1, 10),
        )
        self.teacher_user = User.objects.create_user(
            email="fatima.user@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Fatima Omar",
            role="TEACHER",
            teacher=self.teacher,
        )
        self.class_a = Classroom.objects.create(
            name="Grade 1",
            section="A",
            academic_year="2026-2027",
        )
        self.class_b = Classroom.objects.create(
            name="Grade 2",
            section="A",
            academic_year="2026-2027",
        )
        TeacherClassAssignment.objects.create(
            teacher=self.teacher,
            classroom=self.class_a,
        )
        self.subject = Subject.objects.create(
            classroom=self.class_a,
            name="Arabic",
            code="ARB101",
            max_marks=100,
        )
        self.student = Student.objects.create(
            admission_number="STD-1001",
            full_name="Yusuf Mohamed",
            gender="Male",
            date_of_birth=datetime.date(2015, 5, 12),
            parent_phone="063-4998877",
            classroom=self.class_a,
            registration_date=datetime.date(2026, 9, 1),
        )

    def test_student_contract_validation_queryset_and_promotion(self):
        self.assertIsInstance(self.student.id, uuid.UUID)
        self.assertEqual(Student.generate_next_admission_number(), "STD-1002")
        self.assertEqual(list(Student.objects.for_teacher(self.teacher_user)), [self.student])

        # Admission number format validation
        bad_student = Student(
            admission_number="BAD-99",
            full_name="Invalid Adm",
            gender="Male",
            date_of_birth=datetime.date(2015, 1, 1),
            parent_phone="063-111",
            classroom=self.class_a,
            registration_date=datetime.date(2026, 9, 1),
        )
        with self.assertRaises(ValidationError):
            bad_student.full_clean()

        # DB CHECK constraint on gender & status
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_students SET gender = 'Other' WHERE id = %s;",
                        [self.student.id.hex],
                    )

        # PromotionHistory with RESTRICT FKs
        promo = PromotionHistory.objects.create(
            student=self.student,
            previous_classroom=self.class_a,
            new_classroom=self.class_b,
            academic_year="2026-2027",
            promoted_date=datetime.date(2027, 6, 30),
            promoted_by=self.admin_user,
        )
        self.assertIsInstance(promo.id, uuid.UUID)
        with self.assertRaises(RestrictedError):
            self.student.delete()

    def test_attendance_unique_check_and_excused_validation(self):
        rec = AttendanceRecord.objects.create(
            student=self.student,
            classroom=self.class_a,
            teacher=self.teacher,
            date=datetime.date(2026, 10, 1),
            status="Present",
        )
        self.assertIsInstance(rec.id, uuid.UUID)

        # Duplicate (student, date) rejected by unique_student_daily_attendance
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AttendanceRecord.objects.create(
                    student=self.student,
                    classroom=self.class_a,
                    date=datetime.date(2026, 10, 1),
                    status="Absent",
                )

        # Excused without reason fails clean()
        excused = AttendanceRecord(
            student=self.student,
            classroom=self.class_a,
            date=datetime.date(2026, 10, 2),
            status="Excused",
            excused_reason="   ",
        )
        with self.assertRaises(ValidationError):
            excused.full_clean()

        # DB CHECK constraint chk_attendance_status
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_attendance SET status = 'Late' WHERE id = %s;",
                        [rec.id.hex],
                    )

    def test_examinations_marks_and_summaries(self):
        exam = Examination.objects.create(
            classroom=self.class_a,
            exam_type="Midterm",
            academic_year="2026-2027",
            term="Term 1",
            recorded_date=datetime.date(2026, 11, 1),
        )
        summary = ExaminationStudentSummary.objects.create(
            examination=exam,
            student=self.student,
            activity_score=Decimal("8.50"),
            total_score=Decimal("92.50"),
        )
        mark = ExaminationMark.objects.create(
            examination=exam,
            student=self.student,
            subject=self.subject,
            score=Decimal("84.00"),
            recorded_by=self.teacher,
        )
        self.assertEqual(summary.total_score, Decimal("92.50"))
        self.assertEqual(mark.score, Decimal("84.00"))

        # Exceeding subject.max_marks fails clean()
        over_mark = ExaminationMark(
            examination=exam,
            student=self.student,
            subject=self.subject,
            score=Decimal("105.00"),
        )
        with self.assertRaises(ValidationError):
            over_mark.full_clean()

        # Negative score fails DB CHECK constraint chk_mark_score_positive
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_examination_marks SET score = -1.00 WHERE id = %s;",
                        [mark.id.hex],
                    )

        # Duplicate mark fails unique_exam_student_subject_mark
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ExaminationMark.objects.create(
                    examination=exam,
                    student=self.student,
                    subject=self.subject,
                    score=Decimal("70.00"),
                )
