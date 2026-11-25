"""API tests for persistent subject management."""

import uuid

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import UserPermission
from apps.academics.models import Classroom, Subject


class SubjectAPITests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(
            email="subject-api-admin@example.test",
            password="Strong!SubjectAPITest#2026",
            full_name="Subject API Test Admin",
        )
        self.classroom = Classroom.objects.create(
            name="Subject API Test Class",
            section="A",
            academic_year="2026-2027",
        )
        self.url = reverse("subject-list")
        self.payload = {
            "classroom": str(self.classroom.id),
            "name": "Subject API Test",
            "code": "SUBTEST01",
            "max_marks": 100,
        }

    def test_admin_creates_subject_and_record_persists(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], self.payload["name"])
        self.assertEqual(response.data["code"], self.payload["code"])
        self.assertTrue(
            Subject.objects.filter(
                pk=response.data["id"],
                classroom=self.classroom,
                name=self.payload["name"],
            ).exists()
        )

    def test_missing_required_fields_are_rejected(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_code_in_same_class_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        first = self.client.post(self.url, self.payload, format="json")
        duplicate = self.client.post(
            self.url,
            {**self.payload, "name": "Duplicate Subject"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Subject.objects.count(), 1)

    def test_invalid_class_id_is_rejected(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            self.url,
            {**self.payload, "classroom": str(uuid.uuid4())},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_access_is_rejected(self):
        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_with_subject_permissions_can_create_and_list(self):
        admin = get_user_model().objects.create_user(
            email="subject-api-permitted@example.test",
            password="Strong!SubjectAPITest#2026",
            full_name="Permitted Subject Admin",
            role="ADMIN",
        )
        UserPermission.objects.create(
            user=admin,
            module="subjects",
            can_view=True,
            can_add=True,
        )
        self.client.force_authenticate(user=admin)

        created = self.client.post(self.url, self.payload, format="json")
        fetched = self.client.get(self.url)
        rows = fetched.data if isinstance(fetched.data, list) else fetched.data["results"]

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(fetched.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["id"] == created.data["id"] for row in rows))

    def test_subject_can_be_updated_and_deleted_through_api(self):
        self.client.force_authenticate(user=self.admin)
        created = self.client.post(self.url, self.payload, format="json")
        detail_url = reverse("subject-detail", args=[created.data["id"]])

        updated = self.client.patch(
            detail_url,
            {"name": "Updated Subject API Test", "max_marks": 80},
            format="json",
        )
        deleted = self.client.delete(detail_url)

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["name"], "Updated Subject API Test")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Subject.objects.filter(pk=created.data["id"]).exists())
