"""API-level checks for student creation and authorization."""

import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import UserPermission
from apps.academics.models import Classroom
from apps.students.models import Student


class StudentCreationAPITests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(
            email="student-api-admin@example.test",
            password="Strong!StudentAPITest#2026",
            full_name="Student API Test Admin",
        )
        self.classroom = Classroom.objects.create(
            name="API Test Class",
            section="A",
            academic_year="2026-2027",
        )
        self.url = reverse("student-list")
        self.payload = {
            "admission_number": "STD-900001",
            "full_name": "API Test Student",
            "gender": "Female",
            "date_of_birth": "2018-04-12",
            "parent_phone": "+252 63 000 0000",
            "classroom": str(self.classroom.id),
            "registration_date": "2026-11-24",
        }

    def test_admin_creates_student_and_receives_saved_record(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["id"])
        self.assertEqual(response.data["admission_number"], self.payload["admission_number"])
        self.assertEqual(response.data["full_name"], self.payload["full_name"])
        self.assertEqual(str(response.data["classroom"]), str(self.classroom.id))
        self.assertTrue(
            Student.objects.filter(
                pk=response.data["id"],
                admission_number=self.payload["admission_number"],
            ).exists()
        )

    def test_missing_required_fields_are_rejected(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_class_id_is_rejected(self):
        self.client.force_authenticate(user=self.user)
        payload = {**self.payload, "classroom": str(uuid.uuid4())}

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_creation_is_rejected(self):
        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_with_student_add_permission_can_create(self):
        admin = get_user_model().objects.create_user(
            email="student-api-permitted@example.test",
            password="Strong!StudentAPITest#2026",
            full_name="Permitted Student Admin",
            role="ADMIN",
        )
        UserPermission.objects.create(
            user=admin,
            module="students",
            can_view=True,
            can_add=True,
        )
        self.client.force_authenticate(user=admin)
        payload = {**self.payload, "admission_number": "STD-900002"}

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
