"""Builds (design, pose) assignments for a batch job.

The caller can request any count within the global batch settings, but the
effective count should be capped first via `plan_output_count()` so we do not
overproduce near-duplicate images for a small input set.
"""

import random
from dataclasses import dataclass
from itertools import cycle, product

from app.models.schemas import PairingMode


class PairingValidationError(ValueError):
    pass


@dataclass(frozen=True)
class PairAssignment:
    design: str
    pose: str
    variation: int  # 1-based occurrence count of this exact (design, pose) pair


@dataclass(frozen=True)
class OutputCountPlan:
    requested_count: int
    approved_count: int
    mode_limit: int
    safe_limit: int
    extended_limit: int
    hard_limit: int
    was_capped: bool


def validate_count(count: int, min_count: int, max_count: int) -> None:
    if not isinstance(count, int) or isinstance(count, bool):
        raise PairingValidationError("num_images must be an integer")
    if count < min_count or count > max_count:
        raise PairingValidationError(
            f"num_images must be between {min_count} and {max_count} (got {count})"
        )


def plan_output_count(
    design_count: int,
    pose_count: int,
    mode: PairingMode,
    requested_count: int,
    min_count: int = 1,
    max_count: int = 100,
) -> OutputCountPlan:
    validate_count(requested_count, min_count, max_count)
    if design_count < 1:
        raise PairingValidationError("At least one design image is required")
    if pose_count < 1:
        raise PairingValidationError("At least one hand pose image is required")

    base_pairs = min(design_count, pose_count)
    safe_limit = max(min_count, min(base_pairs * 2, max_count))
    extended_limit = max(min_count, min(design_count * pose_count, base_pairs * 3, max_count))
    hard_limit = min(design_count * pose_count, max_count)

    if mode == PairingMode.one_to_one:
        mode_limit = safe_limit
    elif mode == PairingMode.random:
        mode_limit = extended_limit
    elif mode == PairingMode.cross:
        mode_limit = hard_limit
    else:
        raise PairingValidationError(f"Unknown pairing mode: {mode}")

    approved_count = min(requested_count, mode_limit)
    return OutputCountPlan(
        requested_count=requested_count,
        approved_count=approved_count,
        mode_limit=mode_limit,
        safe_limit=safe_limit,
        extended_limit=extended_limit,
        hard_limit=hard_limit,
        was_capped=approved_count != requested_count,
    )


def _base_pairs(designs: list[str], poses: list[str], mode: PairingMode, seed: int | None = None) -> list[tuple[str, str]]:
    if not designs:
        raise PairingValidationError("At least one design image is required")
    if not poses:
        raise PairingValidationError("At least one hand pose image is required")

    if mode == PairingMode.cross:
        return list(product(designs, poses))

    if mode == PairingMode.one_to_one:
        n = min(len(designs), len(poses))
        return list(zip(designs[:n], poses[:n], strict=True))

    if mode == PairingMode.random:
        rng = random.Random(seed)
        n = max(len(designs), len(poses))
        return [(rng.choice(designs), rng.choice(poses)) for _ in range(n)]

    raise PairingValidationError(f"Unknown pairing mode: {mode}")


def build_pairs(
    designs: list[str],
    poses: list[str],
    mode: PairingMode,
    count: int,
    min_count: int = 1,
    max_count: int = 100,
    seed: int | None = None,
) -> list[PairAssignment]:
    validate_count(count, min_count, max_count)
    base = _base_pairs(designs, poses, mode, seed=seed)

    occurrences: dict[tuple[str, str], int] = {}
    assignments: list[PairAssignment] = []
    base_cycle = cycle(base)
    for _ in range(count):
        pair = next(base_cycle)
        occurrences[pair] = occurrences.get(pair, 0) + 1
        assignments.append(PairAssignment(design=pair[0], pose=pair[1], variation=occurrences[pair]))
    return assignments
