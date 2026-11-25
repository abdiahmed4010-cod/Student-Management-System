"""
Views for SystemSetting singleton (Stage 3.8).
"""

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Classroom, Subject, Teacher
from apps.accounts.permissions import HasModulePermission
from apps.attendance.models import AttendanceRecord
from apps.core.models import SystemSetting
from apps.core.serializers import SystemSettingSerializer
from apps.finances.models import StudentInvoice, StudentPayment
from apps.finances.services import get_financial_overview
from apps.students.models import Student


class SystemSettingView(APIView):
    """
    GET: Returns the singleton institution system settings.
    PUT/PATCH: Updates institution system settings (Admin only).
    """

    module_name = "settings"
    permission_classes = [HasModulePermission]

    def get_object(self):
        obj, _ = SystemSetting.objects.get_or_create(id=1)
        return obj

    def get(self, request):
        obj = self.get_object()
        serializer = SystemSettingSerializer(obj)
        return Response(serializer.data)

    def put(self, request):
        obj = self.get_object()
        serializer = SystemSettingSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        return self.put(request)


class DashboardMetricsView(APIView):
    """
    Returns aggregated dashboard metrics (Stage 3.9).
    - Admins receive institutional KPIs (students, teachers, classes, attendance, fee collections, outstanding balance).
    - Teachers receive strictly scoped academic KPIs (assigned students, assigned classes, assigned subjects; zero financial data).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        is_admin = getattr(user, "role", "TEACHER") == "ADMIN"
        today = timezone.localdate()

        if is_admin:
            total_students = Student.objects.count()
            total_teachers = Teacher.objects.count()
            total_classes = Classroom.objects.count()

            today_att = AttendanceRecord.objects.filter(date=today)
            present = today_att.filter(status="Present").count()
            absent = today_att.filter(status="Absent").count()
            excused = today_att.filter(status="Excused").count()
            total_att = today_att.count()
            attendance_percentage = round((present / total_att) * 100) if total_att > 0 else 0

            month_str = today.strftime("%Y-%m")
            try:
                overview = get_financial_overview(month=month_str)
                monthly_fees_collected = float(overview.get("student_fee_collections", 0))
            except Exception:
                monthly_fees_collected = 0.0

            invoices = StudentInvoice.objects.filter(status__in=["Unpaid", "Partial", "Overdue"])
            outstanding_fees = float(sum(inv.outstanding_balance for inv in invoices))
            total_fee_obligation = float(sum(
                inv.total_amount_due for inv in StudentInvoice.objects.exclude(status="Cancelled")
            ))

            class_distribution = [
                {
                    "classId": str(cls.id),
                    "className": cls.name,
                    "studentCount": cls.students.count(),
                }
                for cls in Classroom.objects.all()
            ]

            recent_students = [
                {
                    "id": str(student.id),
                    "fullName": student.full_name,
                    "classId": str(student.classroom_id) if student.classroom_id else "",
                    "registrationDate": str(student.registration_date),
                }
                for student in Student.objects.select_related("classroom").order_by("-created_at")[:5]
            ]
            recent_transactions = [
                {
                    "id": str(payment.id),
                    "studentId": str(payment.student_id),
                    "feeCategory": payment.fee_category,
                    "paymentMethod": payment.payment_method,
                    "amountPaid": float(payment.amount_paid),
                    "paymentDate": str(payment.payment_date),
                }
                for payment in StudentPayment.objects.select_related("student")
                .filter(transaction_type="Payment").order_by("-payment_date", "-created_at")[:5]
            ]

            return Response({
                "totalStudents": total_students,
                "totalTeachers": total_teachers,
                "totalClasses": total_classes,
                "attendancePercentage": attendance_percentage,
                "attendanceToday": {
                    "present": present,
                    "absent": absent,
                    "excused": excused,
                    "total": total_att,
                },
                "monthlyFeesCollected": monthly_fees_collected,
                "outstandingFees": outstanding_fees,
                "totalFeeObligation": total_fee_obligation,
                "classDistribution": class_distribution,
                "recentStudents": recent_students,
                "recentTransactions": recent_transactions,
            })

        # Teacher scoped metrics
        teacher = getattr(user, "teacher", None)
        if teacher:
            assigned_class_ids = list(teacher.class_assignments.values_list("classroom_id", flat=True))
            if teacher.homeroom_classes.exists():
                assigned_class_ids.extend(list(teacher.homeroom_classes.values_list("id", flat=True)))
            assigned_class_ids = list(set(assigned_class_ids))

            classes_qs = Classroom.objects.filter(id__in=assigned_class_ids)
            total_classes = classes_qs.count()
            students_qs = Student.objects.filter(classroom_id__in=assigned_class_ids)
            total_students = students_qs.count()
            total_subjects = teacher.subject_assignments.count()

            today_att = AttendanceRecord.objects.filter(classroom_id__in=assigned_class_ids, date=today)
            present = today_att.filter(status="Present").count()
            absent = today_att.filter(status="Absent").count()
            excused = today_att.filter(status="Excused").count()
            total_att = today_att.count()
            attendance_percentage = round((present / total_att) * 100) if total_att > 0 else 0

            class_distribution = [
                {
                    "classId": str(cls.id),
                    "className": cls.name,
                    "studentCount": cls.students.count(),
                }
                for cls in classes_qs
            ]
        else:
            total_classes = 0
            total_students = 0
            total_subjects = 0
            attendance_percentage = 0
            present = absent = excused = total_att = 0
            class_distribution = []

        return Response({
            "totalStudents": total_students,
            "totalTeachers": 1,
            "totalClasses": total_classes,
            "totalSubjects": total_subjects,
            "attendancePercentage": attendance_percentage,
            "attendanceToday": {
                "present": present,
                "absent": absent,
                "excused": excused,
                "total": total_att,
            },
            # Zero financial exposure for teachers
            "monthlyFeesCollected": 0.0,
            "outstandingFees": 0.0,
            "totalFeeObligation": 0.0,
            "classDistribution": class_distribution,
        })

