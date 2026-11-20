"""
Automated model, FK, on_delete, unique, and CHECK constraint tests for apps.academics
and the deferred accounts.User.teacher relationship.
"""

import datetime
import uuid

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.db.models import RestrictedError
from django.test import TestCase

from apps.academics.models import (
    Classroom,
    Subject,
    Teacher,
    TeacherClassAssignment,
    TeacherSubjectAssignment,
)

User = get_user_model()


class AcademicsModelsTests(TestCase):
    def setUp(self):
        self.teacher = Teacher.objects.create(
            full_name="Ustadh Ahmed Ali",
            email="ahmed.ali@studently.edu",
            phone="063-4001122",
            specialization="Islamic Studies",
            joined_date=datetime.date(2024, 9, 1),
        )
        self.classroom = Classroom.objects.create(
            name="Grade 1",
            section="A",
            room="Room 101",
            capacity=35,
            academic_year="2026-2027",
            teacher=self.teacher,
        )
        self.subject = Subject.objects.create(
            classroom=self.classroom,
            name="Mathematics",
            code="MATH101",
            max_marks=100,
        )

    def test_uuid_primary_keys_and_user_teacher_relationship(self):
        self.assertIsInstance(self.teacher.id, uuid.UUID)
        self.assertIsInstance(self.classroom.id, uuid.UUID)
        self.assertIsInstance(self.subject.id, uuid.UUID)

        user = User.objects.create_user(
            email="teacher.login@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Ustadh Ahmed Ali",
            role="TEACHER",
            teacher=self.teacher,
        )
        self.assertEqual(user.teacher_id, self.teacher.id)
        self.assertIn(user, self.teacher.user_accounts.all())

        # Deleting Teacher sets User.teacher to NULL (ON DELETE SET NULL) and Classroom.teacher to NULL
        self.teacher.delete()
        user.refresh_from_db()
        self.classroom.refresh_from_db()
        self.assertIsNone(user.teacher)
        self.assertIsNone(self.classroom.teacher)

    def test_unique_constraints_and_junction_cascades(self):
        # Duplicate classroom (name, section, academic_year)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Classroom.objects.create(
                    name="Grade 1",
                    section="A",
                    academic_year="2026-2027",
                )

        # Duplicate subject code within same classroom
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Subject.objects.create(
                    classroom=self.classroom,
                    name="Math Duplicate",
                    code="MATH101",
                )

        # Duplicate TeacherClassAssignment & TeacherSubjectAssignment
        tca = TeacherClassAssignment.objects.create(
            teacher=self.teacher,
            classroom=self.classroom,
        )
        self.assertIsInstance(tca.id, uuid.UUID)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TeacherClassAssignment.objects.create(
                    teacher=self.teacher,
                    classroom=self.classroom,
                )

        tsa = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher,
            subject=self.subject,
        )
        self.assertIsInstance(tsa.id, uuid.UUID)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TeacherSubjectAssignment.objects.create(
                    teacher=self.teacher,
                    subject=self.subject,
                )

        # Classroom deletion is RESTRICTED while Subject references it
        with self.assertRaises(RestrictedError):
            self.classroom.delete()

        # Deleting Teacher CASCADES to junction tables
        self.teacher.delete()
        self.assertEqual(TeacherClassAssignment.objects.count(), 0)
        self.assertEqual(TeacherSubjectAssignment.objects.count(), 0)

    def test_db_check_constraints(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_teachers SET account_status = 'Fired' WHERE id = %s;",
                        [self.teacher.id.hex],
                    )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Classroom.objects.create(
                    name="Grade 2",
                    section="A",
                    capacity=0,
                    academic_year="2026-2027",
                )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Subject.objects.create(
                    classroom=self.classroom,
                    name="Zero Marks",
                    code="ZERO01",
                    max_marks=0,
                )
