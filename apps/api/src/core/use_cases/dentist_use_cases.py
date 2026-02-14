from __future__ import annotations

import re
from uuid import UUID

from src.core.domain.entities import Dentist
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import DentistRepository


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _normalize_color(value: str | None) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None

    upper = normalized.upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", upper):
        raise ValidationError("Cor do dentista invalida. Use o padrao #RRGGBB.")
    return upper


class DentistUseCases:
    def __init__(self, dentist_repository: DentistRepository) -> None:
        self.dentist_repository = dentist_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Dentist], int]:
        return self.dentist_repository.list(search=search, limit=limit, offset=offset)

    def get(self, dentist_id: UUID) -> Dentist:
        dentist = self.dentist_repository.get(dentist_id)
        if dentist is None:
            raise NotFoundError("Dentista nao encontrado.")
        return dentist

    def create(self, data: dict) -> Dentist:
        full_name = (data.get("full_name") or "").strip()
        if not full_name:
            raise ValidationError("Nome completo do dentista e obrigatorio.")

        data["full_name"] = full_name
        data["specialty"] = _normalize_text(data.get("specialty"))
        data["color"] = _normalize_color(data.get("color"))
        data["availability"] = self._normalize_availability(data.get("availability"))
        return self.dentist_repository.create(data)

    def update(self, dentist_id: UUID, data: dict) -> Dentist:
        if "full_name" in data and not (data.get("full_name") or "").strip():
            raise ValidationError("Nome completo do dentista e obrigatorio.")

        if "full_name" in data:
            data["full_name"] = data["full_name"].strip()
        if "specialty" in data:
            data["specialty"] = _normalize_text(data.get("specialty"))
        if "color" in data:
            data["color"] = _normalize_color(data.get("color"))
        if "availability" in data:
            data["availability"] = self._normalize_availability(data.get("availability"))

        dentist = self.dentist_repository.update(dentist_id, data)
        if dentist is None:
            raise NotFoundError("Dentista nao encontrado.")
        return dentist

    def delete(self, dentist_id: UUID) -> None:
        deleted = self.dentist_repository.delete(dentist_id)
        if not deleted:
            raise NotFoundError("Dentista nao encontrado.")

    def _normalize_availability(self, availability_raw: object) -> list[dict[str, str]]:
        if availability_raw is None:
            return []
        if not isinstance(availability_raw, list):
            raise ValidationError("A disponibilidade deve ser uma lista de horarios.")

        normalized: list[dict[str, str]] = []
        seen: set[tuple[str, str, str]] = set()

        for idx, slot_raw in enumerate(availability_raw):
            if not isinstance(slot_raw, dict):
                raise ValidationError(f"Disponibilidade invalida na posicao {idx + 1}.")

            day_of_week = str(slot_raw.get("day_of_week", "")).strip().lower()
            start_time = str(slot_raw.get("start_time", "")).strip()
            end_time = str(slot_raw.get("end_time", "")).strip()

            if not day_of_week or not start_time or not end_time:
                raise ValidationError("Cada disponibilidade precisa de dia, inicio e fim.")

            if end_time <= start_time:
                raise ValidationError("Em cada disponibilidade, o horario final deve ser maior que o inicial.")

            key = (day_of_week, start_time, end_time)
            if key in seen:
                continue

            seen.add(key)
            normalized.append(
                {
                    "day_of_week": day_of_week,
                    "start_time": start_time,
                    "end_time": end_time,
                }
            )

        normalized.sort(key=lambda item: (item["day_of_week"], item["start_time"], item["end_time"]))
        return normalized
