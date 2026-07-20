import pytest

from app.models.schemas import PairingMode
from app.services.pairing_service import (
    PairingValidationError,
    build_pairs,
    plan_output_count,
    validate_count,
)


@pytest.mark.parametrize("mode", [PairingMode.cross, PairingMode.random, PairingMode.one_to_one])
def test_count_is_respected_after_capping(mode):
    designs = ["d1.png", "d2.png", "d3.png"]
    poses = ["p1.png", "p2.png"]
    plan = plan_output_count(
        design_count=len(designs),
        pose_count=len(poses),
        mode=mode,
        requested_count=20,
        min_count=1,
        max_count=100,
    )

    assignments = build_pairs(designs, poses, mode, count=plan.approved_count, min_count=1, max_count=100)

    assert len(assignments) == plan.approved_count
    for a in assignments:
        assert a.design in designs
        assert a.pose in poses


def test_count_smaller_than_base_pairs_still_respected():
    designs = ["d1.png", "d2.png", "d3.png"]
    poses = ["p1.png", "p2.png", "p3.png"]

    assignments = build_pairs(designs, poses, PairingMode.cross, count=2, min_count=1, max_count=100)
    assert len(assignments) == 2


def test_cross_pair_covers_every_combination_before_repeating():
    designs = ["d1", "d2"]
    poses = ["p1", "p2", "p3"]
    assignments = build_pairs(designs, poses, PairingMode.cross, count=6, min_count=1, max_count=100)

    pairs = {(a.design, a.pose) for a in assignments}
    assert pairs == {(d, p) for d in designs for p in poses}
    assert all(a.variation == 1 for a in assignments)


def test_one_to_one_pairs_by_index_and_cycles_shorter_list():
    designs = ["d1", "d2", "d3"]
    poses = ["p1"]
    assignments = build_pairs(designs, poses, PairingMode.one_to_one, count=1, min_count=1, max_count=100)

    assert [a.design for a in assignments] == ["d1"]
    assert all(a.pose == "p1" for a in assignments)


def test_variation_increments_for_repeated_pairs():
    assignments = build_pairs(["d1"], ["p1"], PairingMode.cross, count=3, min_count=1, max_count=100)
    assert [a.variation for a in assignments] == [1, 2, 3]


@pytest.mark.parametrize("count", [0, -1, 101, 1000])
def test_invalid_counts_are_rejected(count):
    with pytest.raises(PairingValidationError):
        validate_count(count, min_count=1, max_count=100)


@pytest.mark.parametrize("count", [1, 50, 100])
def test_valid_counts_pass(count):
    validate_count(count, min_count=1, max_count=100)


def test_empty_designs_or_poses_rejected():
    with pytest.raises(PairingValidationError):
        build_pairs([], ["p1"], PairingMode.cross, count=5, min_count=1, max_count=100)
    with pytest.raises(PairingValidationError):
        build_pairs(["d1"], [], PairingMode.cross, count=5, min_count=1, max_count=100)


def test_plan_output_count_caps_one_to_one_to_safe_limit():
    plan = plan_output_count(4, 4, PairingMode.one_to_one, requested_count=20, min_count=1, max_count=100)

    assert plan.safe_limit == 8
    assert plan.approved_count == 8
    assert plan.was_capped is True


def test_plan_output_count_caps_random_to_extended_limit():
    plan = plan_output_count(4, 4, PairingMode.random, requested_count=20, min_count=1, max_count=100)

    assert plan.extended_limit == 12
    assert plan.approved_count == 12
    assert plan.was_capped is True


def test_plan_output_count_caps_cross_to_hard_limit():
    plan = plan_output_count(4, 4, PairingMode.cross, requested_count=20, min_count=1, max_count=100)

    assert plan.hard_limit == 16
    assert plan.approved_count == 16
    assert plan.was_capped is True
