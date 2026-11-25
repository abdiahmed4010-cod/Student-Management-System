from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.academics.models import Classroom, Subject, Teacher, TeacherClassAssignment, TeacherSubjectAssignment
from apps.accounts.models import UserPermission
from apps.attendance.models import AttendanceRecord
from apps.examinations.models import Examination, ExaminationMark
from apps.students.models import Student

User = get_user_model()


class ReportingScopeAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = Teacher.objects.create(
            full_name="Ustad Musa",
            email="musa.reporting@test.com",
            phone="+252600000001",
            joined_date=date(2026, 1, 1),
        )
        self.teacher_user = User.objects.create_user(
            email=self.teacher.email,
            password="StrongPassword123!",
            full_name=self.teacher.full_name,
            role="TEACHER",
            teacher=self.teacher,
        )
        for module in ("attendance", "examinations"):
            UserPermission.objects.create(user=self.teacher_user, module=module, can_view=True)

        self.assigned_class = Classroom.objects.create(
            name="Grade 1", section="A", capacity=30, teacher=self.teacher,
        )
        self.shared_class = Classroom.objects.create(name="Grade 2", section="A", capacity=30)
        TeacherClassAssignment.objects.create(teacher=self.teacher, classroom=self.shared_class)
        self.other_class = Classroom.objects.create(name="Grade 3", section="A", capacity=30)

        self.assigned_subject = Subject.objects.create(classroom=self.assigned_class, name="Quran", code="QUR")
        self.unassigned_subject = Subject.objects.create(classroom=self.assigned_class, name="Arabic", code="ARB")
        TeacherSubjectAssignment.objects.create(teacher=self.teacher, subject=self.assigned_subject)

        self.assigned_student = Student.objects.create(
            admission_number="RPT-001", full_name="Amina Hassan", gender="Female",
            date_of_birth=date(2018, 1, 1), parent_phone="+252600000002",
            registration_date=date(2026, 1, 1), classroom=self.assigned_class,
        )
        self.other_student = Student.objects.create(
            admission_number="RPT-002", full_name="Abdi Ali", gender="Male",
            date_of_birth=date(2018, 1, 2), parent_phone="+252600000003",
            registration_date=date(2026, 1, 1), classroom=self.other_class,
        )
        day = date(2026, 1, 2)
        self.assigned_attendance = AttendanceRecord.objects.create(
            student=self.assigned_student, classroom=self.assigned_class, teacher=self.teacher,
            date=day, status="Present",
        )
        AttendanceRecord.objects.create(
            student=self.other_student, classroom=self.other_class, date=day, status="Absent",
        )

        self.exam = Examination.objects.create(
            classroom=self.assigned_class, exam_type="Midterm", academic_year="2026-2027",
            term="Term 1", recorded_date=day,
        )
        self.assigned_mark = ExaminationMark.objects.create(
            examination=self.exam, student=self.assigned_student, subject=self.assigned_subject,
            score=Decimal("85.00"), recorded_by=self.teacher,
        )
        self.unassigned_mark = ExaminationMark.objects.create(
            examination=self.exam, student=self.assigned_student, subject=self.unassigned_subject,
            score=Decimal("90.00"),
        )

    def test_teacher_attendance_list_is_limited_to_assigned_and_homeroom_classes(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.get("/api/v1/attendance/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [str(self.assigned_attendance.id)])
        denied_filter = self.client.get(f"/api/v1/attendance/?class_id={self.other_class.id}")
        self.assertEqual(denied_filter.status_code, 200)
        self.assertEqual(denied_filter.data, [])

    def test_teacher_examination_list_contains_only_assigned_subject_marks(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.get("/api/v1/examinations/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            [mark["id"] for mark in response.data[0]["marks"]],
            [str(self.assigned_mark.id)],
        )
        denied_filter = self.client.get(f"/api/v1/examinations/?class_id={self.other_class.id}")
        self.assertEqual(denied_filter.status_code, 200)
        self.assertEqual(denied_filter.data, [])

    def test_dashboard_metrics_uses_real_attendance_and_teacher_class_scope(self):
        today = timezone.localdate()
        assigned_student = Student.objects.create(
            admission_number="RPT-003", full_name="Hawa Musa", gender="Female",
            date_of_birth=date(2018, 1, 3), parent_phone="+252600000004",
            registration_date=date(2026, 1, 1), classroom=self.assigned_class,
        )
        AttendanceRecord.objects.create(
            student=self.assigned_student, classroom=self.assigned_class, teacher=self.teacher,
            date=today, status="Present",
        )
        AttendanceRecord.objects.create(
            student=assigned_student, classroom=self.assigned_class, teacher=self.teacher,
            date=today, status="Absent",
        )
        AttendanceRecord.objects.create(
            student=self.other_student, classroom=self.other_class, date=today, status="Absent",
        )

        admin = User.objects.create_user(
            email="admin.reporting@test.com", password="StrongPassword123!",
            full_name="Reporting Admin", role="ADMIN",
        )
        self.client.force_authenticate(admin)
        admin_metrics = self.client.get("/api/v1/dashboard/metrics/").data
        self.assertEqual(admin_metrics["attendanceToday"], {"present": 1, "absent": 2, "excused": 0, "total": 3})
        self.assertEqual(admin_metrics["attendancePercentage"], 33)
        self.assertEqual(len(admin_metrics["recentStudents"]), 3)

        self.client.force_authenticate(self.teacher_user)
        teacher_metrics = self.client.get("/api/v1/dashboard/metrics/").data
        self.assertEqual(teacher_metrics["attendanceToday"], {"present": 1, "absent": 1, "excused": 0, "total": 2})
        self.assertEqual(teacher_metrics["attendancePercentage"], 50)
        self.assertEqual(teacher_metrics["monthlyFeesCollected"], 0.0)
        self.assertEqual(teacher_metrics["outstandingFees"], 0.0)
