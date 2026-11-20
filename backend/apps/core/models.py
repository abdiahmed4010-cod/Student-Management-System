"""
Core system configuration model for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.7)
- documentation/phase-2/DATA_DICTIONARY.md (Section 2.20: studently_system_settings)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class SystemSetting(models.Model):
    """Single-row singleton (`id = 1`) institutional configuration and grading weights."""

    CALC_METHOD_CHOICES = [
        ("sum", "Simple Sum (Midterm + Final)"),
        ("average", "Equal Average (50% Midterm / 50% Final)"),
        ("weighted", "Weighted Percentage"),
    ]
    TERM_CHOICES = [
        ("Term 1", "Term 1"),
        ("Term 2", "Term 2"),
        ("Term 3", "Term 3"),
    ]

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    institution_name = models.CharField(max_length=200, default="MADARASATUL AL-IMAAM")
    institution_logo = models.CharField(
        max_length=255,
        default="/assets/aistudio/image_6159b039.png",
    )
    contact_phone = models.CharField(max_length=50, default="063-4129440")
    contact_email = models.EmailField(max_length=254, default="admin@alimaama.demo")
    address = models.CharField(max_length=255, default="Hargeisa, Somaliland")
    academic_year = models.CharField(max_length=20, default="2026-2027")
    current_term = models.CharField(
        max_length=20,
        choices=TERM_CHOICES,
        default="Term 1",
    )
    class_fee_monthly = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("45.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    school_fee_monthly = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("35.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency_symbol = models.CharField(max_length=10, default="$")
    result_calc_method = models.CharField(
        max_length=20,
        choices=CALC_METHOD_CHOICES,
        default="sum",
    )
    weighted_midterm = models.PositiveIntegerField(
        default=40,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    weighted_final = models.PositiveIntegerField(
        default=60,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_system_settings"
        verbose_name = "System Setting"
        verbose_name_plural = "System Settings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="chk_settings_singleton_id",
            ),
            models.CheckConstraint(
                condition=models.Q(result_calc_method__in=["sum", "average", "weighted"]),
                name="chk_settings_calc_method",
            ),
            models.CheckConstraint(
                condition=models.Q(current_term__in=["Term 1", "Term 2", "Term 3"]),
                name="chk_settings_term",
            ),
            models.CheckConstraint(
                condition=models.Q(class_fee_monthly__gte=Decimal("0.00"))
                & models.Q(school_fee_monthly__gte=Decimal("0.00")),
                name="chk_settings_fees_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(weighted_midterm__gte=0)
                & models.Q(weighted_midterm__lte=100)
                & models.Q(weighted_final__gte=0)
                & models.Q(weighted_final__lte=100),
                name="chk_weights_range",
            ),
            models.CheckConstraint(
                condition=~models.Q(result_calc_method="weighted")
                | models.Q(weighted_midterm=100 - models.F("weighted_final")),
                name="chk_weights_sum",
            ),
        ]

    def __str__(self):
        return f"{self.institution_name} ({self.academic_year} - {self.current_term})"

    def clean(self):
        self.id = 1
        if self.result_calc_method == "weighted" and (
            self.weighted_midterm + self.weighted_final != 100
        ):
            raise ValidationError(
                "Weighted Midterm and Final percentages must sum exactly to 100%."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(id=1)
        return obj
