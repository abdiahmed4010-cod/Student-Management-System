"""API tests for persistent teacher and assignment management."""

import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import UserPermission
from apps.academics.models import (
    Classroom,
    Subject,
    Teacher,
    TeacherClassAssignment,
    TeacherSubjectAssignment,
)


class TeacherAPITests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            email="teacher-api-admin@example.test",
            password="Strong!TeacherAPITest#2026",
            full_name="Teacher API Test Admin",
        )
        self.classroom = Classroom.objects.create(
            name="Teacher API Test Class",
            section="A",
            academic_year="2026-2027",
        )
        self.subject = Subject.objects.create(
            classroom=self.classroom,
            name="Teacher API Test Subject",
            code="TCHTEST01",
            max_marks=100,
        )
        self.url = reverse("teacher-list")
        self.payload = {
            "full_name": "Teacher API Test Person",
            "email": "teacher.api.person@example.test",
            "phone": "+252 63 000 0001",
            "account_status": "Active",
            "specialization": "Persistence Test Only",
            "joined_date": "2026-11-24",
            "assigned_class_ids": [str(self.classroom.id)],
            "assigned_subject_ids": [str(self.subject.id)],
        }

    def test_admin_creates_teacher_and_assignment_records_persist(self):
        self.client.force_authenticate(user=self.admin)
        user_count = get_user_model().objects.count()

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        teacher = Teacher.objects.get(pk=response.data["id"])
        self.assertEqual(teacher.email, self.payload["email"])
        self.assertEqual(response.data["assigned_class_ids"], [str(self.classroom.id)])
        self.assertEqual(response.data["assigned_subject_ids"], [str(self.subject.id)])
        self.assertTrue(
            TeacherClassAssignment.objects.filter(
                teacher=teacher,
                classroom=self.classroom,
            ).exists()
        )
        self.assertTrue(
            TeacherSubjectAssignment.objects.filter(
                teacher=teacher,
                subject=self.subject,
            ).exists()
        )
        self.assertEqual(get_user_model().objects.count(), user_count)

    def test_missing_required_fields_are_rejected(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        first = self.client.post(self.url, self.payload, format="json")
        duplicate = self.client.post(
            self.url,
            {**self.payload, "phone": "+252 63 000 0002"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Teacher.objects.count(), 1)

    def test_invalid_assignment_ids_are_rejected(self):
        self.client.force_authenticate(user=self.admin)

        bad_class = self.client.post(
            self.url,
            {**self.payload, "email": "bad.class@example.test", "assigned_class_ids": [str(uuid.uuid4())]},
            format="json",
        )
        bad_subject = self.client.post(
            self.url,
            {**self.payload, "email": "bad.subject@example.test", "assigned_subject_ids": [str(uuid.uuid4())]},
            format="json",
        )

        self.assertEqual(bad_class.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_subject.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_creation_is_rejected(self):
        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_with_teacher_permissions_can_create_and_list(self):
        admin = get_user_model().objects.create_user(
            email="teacher-api-permitted@example.test",
            password="Strong!TeacherAPITest#2026",
            full_name="Permitted Teacher Admin",
            role="ADMIN",
        )
        UserPermission.objects.create(
            user=admin,
            module="teachers",
            can_view=True,
            can_add=True,
        )
        self.client.force_authenticate(user=admin)

        created = self.client.post(
            self.url,
            {**self.payload, "email": "teacher.permitted@example.test"},
            format="json",
        )
        fetched = self.client.get(self.url)
        rows = fetched.data if isinstance(fetched.data, list) else fetched.data["results"]

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(fetched.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["id"] == created.data["id"] for row in rows))

    def test_teacher_update_and_delete_use_the_api(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(self.url, self.payload, format="json")
        detail_url = reverse("teacher-detail", args=[created.data["id"]])
        updated = self.client.patch(
            detail_url,
            {
                "full_name": "Updated Teacher API Test",
                "assigned_class_ids": [],
                "assigned_subject_ids": [],
            },
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["full_name"], "Updated Teacher API Test")
        self.assertEqual(updated.data["assigned_class_ids"], [])
        self.assertFalse(TeacherClassAssignment.objects.filter(teacher_id=created.data["id"]).exists())
        self.assertFalse(TeacherSubjectAssignment.objects.filter(teacher_id=created.data["id"]).exists())

        deleted = self.client.delete(detail_url)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Teacher.objects.filter(pk=created.data["id"]).exists())
