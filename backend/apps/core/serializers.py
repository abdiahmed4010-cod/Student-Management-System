"""
Serializers for SystemSetting singleton (Stage 3.8).
"""

from rest_framework import serializers
from apps.core.models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = [
            "id",
            "institution_name",
            "institution_logo",
            "contact_phone",
            "contact_email",
            "address",
            "academic_year",
            "current_term",
            "class_fee_monthly",
            "school_fee_monthly",
            "currency_symbol",
            "result_calc_method",
            "midterm_weight_pct",
            "final_weight_pct",
            "enable_class_fee",
            "enable_school_fee",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Compatibility aliases for frontend
        ret["institutionName"] = ret.get("institution_name")
        ret["contactPhone"] = ret.get("contact_phone")
        ret["contactEmail"] = ret.get("contact_email")
        ret["currencySymbol"] = ret.get("currency_symbol")
        ret["classFeeMonthly"] = float(ret.get("class_fee_monthly") or 0)
        ret["schoolFeeMonthly"] = float(ret.get("school_fee_monthly") or 0)
        ret["academicYear"] = ret.get("academic_year")
        ret["currentTerm"] = ret.get("current_term")
        return ret
