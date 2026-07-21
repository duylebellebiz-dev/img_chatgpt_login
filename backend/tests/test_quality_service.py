import shutil
from pathlib import Path

from app.config import Settings
from app.services.image_service import ImageService
from app.services.quality_service import QualityService, _build_retry_feedback


def _settings(**overrides) -> Settings:
    defaults = {
        "anthropic_api_key": "",
        "image_provider": "mock",
        "near_duplicate_max_retries": 2,
        # 0 so tests that aren't about the fidelity floor (most of them,
        # asserting on quality_pass_threshold/retry-budget behavior) aren't
        # affected by mock_score's random-ish per-criterion values.
        "quality_fidelity_floor": 0,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_score_image_breakdown_includes_pose_fidelity(tmp_path, tiny_png_bytes):
    """pose_fidelity is the criterion that catches a compositing failure a
    single-image judge would otherwise miss: an output that's actually an
    unedited copy of the design reference can still look like a perfectly
    fine, well-lit manicure photo on its own — nothing about "anatomy" or
    "nail_accuracy" alone flags that it's the wrong hand/pose entirely."""
    path = tmp_path / "img.png"
    path.write_bytes(tiny_png_bytes)

    quality = QualityService(_settings())
    _, breakdown = quality.score_image(path)

    assert "pose_fidelity" in breakdown


def test_mock_scoring_is_deterministic_for_same_bytes(tmp_path, tiny_png_bytes):
    path = tmp_path / "img.png"
    path.write_bytes(tiny_png_bytes)

    quality = QualityService(_settings())
    overall1, breakdown1 = quality.score_image(path)
    overall2, breakdown2 = quality.score_image(path)

    assert overall1 == overall2
    assert breakdown1 == breakdown2
    assert 0 <= overall1 <= 100


def test_passes_immediately_when_score_meets_low_threshold(tmp_path, tiny_png_bytes):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=0, quality_max_retries=3)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    result = quality.generate_with_quality_gate(image_service, design, pose, "prompt", out, variation=1)

    assert result.passed is True
    assert result.attempt == 1


def test_stops_after_max_retries_when_threshold_unreachable(tmp_path, tiny_png_bytes):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    # threshold of 101 can never be met (scores are capped at 100) -> must
    # exhaust all attempts without an infinite loop.
    settings = _settings(quality_pass_threshold=101, quality_max_retries=3)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    result = quality.generate_with_quality_gate(image_service, design, pose, "prompt", out, variation=1)

    assert result.passed is False
    assert result.attempt == 1 + settings.quality_max_retries  # 1 initial + 3 retries


def test_retries_produce_different_mock_images(tmp_path, tiny_png_bytes):
    """Regression guard: earlier version reused identical mock bytes on every
    retry attempt, so a failing image could never become a passing one."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out1 = tmp_path / "attempt1.png"
    out2 = tmp_path / "attempt2.png"

    settings = _settings()
    image_service = ImageService(settings)
    image_service.generate_image(design, pose, "prompt", variation=1, out_path=out1, attempt=1)
    image_service.generate_image(design, pose, "prompt", variation=1, out_path=out2, attempt=2)

    assert out1.read_bytes() != out2.read_bytes()


def test_generate_with_quality_gate_retries_when_output_is_a_near_duplicate_of_an_input(
    tmp_path, tiny_png_bytes, monkeypatch
):
    """Regression guard for the bug where an image model returned one of
    the two reference images almost unchanged instead of merging them. That
    must be caught and retried automatically, without ever handing the
    vision judge a near-copy of an input to score as if it were a real
    generation attempt."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=0, quality_max_retries=3)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    # Attempt 1 "fails" by literally copying the pose reference back out
    # (simulating the observed provider bug); attempt 2 behaves normally.
    real_generate_image = image_service.generate_image
    calls = {"n": 0}

    def fake_generate_image(design_path, pose_path, prompt, variation, out_path, attempt=1, **kwargs):
        calls["n"] += 1
        if attempt == 1:
            shutil.copyfile(pose_path, out_path)
            return out_path, "image/png"
        return real_generate_image(design_path, pose_path, prompt, variation, out_path, attempt=attempt, **kwargs)

    monkeypatch.setattr(image_service, "generate_image", fake_generate_image)

    score_calls: list[Path] = []
    real_score_image = quality.score_image

    def tracking_score_image(path, design_path=None, pose_path=None):
        score_calls.append(path)
        return real_score_image(path, design_path, pose_path)

    monkeypatch.setattr(quality, "score_image", tracking_score_image)

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert calls["n"] == 2
    assert score_calls == [out]  # the near-duplicate attempt 1 image was never sent to the judge
    assert result.attempt == 2
    assert "returned the pose reference image almost unchanged" in result.prompt_used


def test_near_duplicate_retries_even_when_quality_max_retries_is_zero(tmp_path, tiny_png_bytes, monkeypatch):
    """near_duplicate_max_retries is independent of quality_max_retries: a
    compositing failure (the provider echoing a reference image unchanged)
    must still get a corrective retry even when ordinary low-score retries
    are disabled for cost reasons."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=0, quality_max_retries=0, near_duplicate_max_retries=2)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    real_generate_image = image_service.generate_image
    calls = {"n": 0}

    def fake_generate_image(design_path, pose_path, prompt, variation, out_path, attempt=1, **kwargs):
        calls["n"] += 1
        if attempt == 1:
            shutil.copyfile(pose_path, out_path)
            return out_path, "image/png"
        return real_generate_image(design_path, pose_path, prompt, variation, out_path, attempt=attempt, **kwargs)

    monkeypatch.setattr(image_service, "generate_image", fake_generate_image)

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert calls["n"] == 2
    assert result.attempt == 2
    assert result.passed is True


def test_near_duplicate_retry_budget_is_exhausted_independently(tmp_path, tiny_png_bytes, monkeypatch):
    """If every attempt is a near-duplicate, retrying must still stop at
    1 + near_duplicate_max_retries rather than looping forever."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=0, quality_max_retries=0, near_duplicate_max_retries=2)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    def always_near_duplicate(design_path, pose_path, prompt, variation, out_path, attempt=1, **kwargs):
        shutil.copyfile(pose_path, out_path)
        return out_path, "image/png"

    monkeypatch.setattr(image_service, "generate_image", always_near_duplicate)

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.attempt == 1 + settings.near_duplicate_max_retries
    assert result.passed is False


def test_hard_failure_score_retries_even_when_quality_max_retries_is_zero(tmp_path, tiny_png_bytes, monkeypatch):
    """Regression guard for a real production case: is_near_duplicate_image's
    pixel-diff check can miss a genuine compositing failure (it isn't a
    reliable discriminator — a good composite and a bad near-copy scored
    similar diff values in production data). When the vision judge itself
    scores an attempt catastrophically low, that must still draw from the
    near_duplicate_max_retries budget and retry, even though it's an
    ordinary quality_max_retries=0 (no-retry) low score by the general rule."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(
        quality_pass_threshold=80,
        quality_max_retries=0,
        near_duplicate_max_retries=2,
        quality_hard_failure_threshold=30,
    )
    quality = QualityService(settings)
    image_service = ImageService(settings)

    responses = iter(
        [
            (10.0, {"anatomy": 10, "pose_fidelity": 10, "nail_accuracy": 10, "lighting": 10, "background": 10, "realism": 10, "marketing_quality": 10}),
            (90.0, {"anatomy": 90, "pose_fidelity": 90, "nail_accuracy": 90, "lighting": 90, "background": 90, "realism": 90, "marketing_quality": 90}),
        ]
    )
    monkeypatch.setattr(quality, "score_image", lambda path, design_path=None, pose_path=None: next(responses))

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.attempt == 2
    assert result.passed is True


def test_ordinary_low_score_does_not_retry_when_quality_max_retries_is_zero(tmp_path, tiny_png_bytes, monkeypatch):
    """A mediocre-but-not-catastrophic score (above quality_hard_failure_threshold)
    must respect quality_max_retries=0 and NOT consume the near-duplicate
    retry budget — only a genuinely broken attempt should draw from it."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(
        quality_pass_threshold=80,
        quality_max_retries=0,
        near_duplicate_max_retries=2,
        quality_hard_failure_threshold=30,
    )
    quality = QualityService(settings)
    image_service = ImageService(settings)

    monkeypatch.setattr(
        quality,
        "score_image",
        lambda path, design_path=None, pose_path=None: (
            65.0,
            {"anatomy": 70, "pose_fidelity": 70, "nail_accuracy": 55, "lighting": 70, "background": 70, "realism": 70, "marketing_quality": 55},
        ),
    )

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.attempt == 1
    assert result.passed is False


def test_fidelity_floor_fails_a_high_overall_score_with_poor_nail_accuracy(tmp_path, tiny_png_bytes, monkeypatch):
    """Regression guard for the actual reported bug: the image provider
    reinterprets the design reference instead of copying it, but the other
    six criteria (lighting/background/realism/anatomy/pose_fidelity/
    marketing_quality) still score well, so the overall average clears
    quality_pass_threshold even though the design was never actually
    preserved. nail_accuracy must independently clear quality_fidelity_floor
    or the attempt is not passed, regardless of the overall average."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=80, quality_max_retries=0, quality_fidelity_floor=70)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    monkeypatch.setattr(
        quality,
        "score_image",
        lambda path, design_path=None, pose_path=None: (
            84.3,
            {"anatomy": 95, "pose_fidelity": 95, "nail_accuracy": 50, "lighting": 90, "background": 90,
             "realism": 90, "marketing_quality": 90},
        ),
    )

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.overall >= 80  # would have passed under the old overall-only rule
    assert result.passed is False


def test_fidelity_floor_fails_a_high_overall_score_with_poor_pose_fidelity(tmp_path, tiny_png_bytes, monkeypatch):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=80, quality_max_retries=0, quality_fidelity_floor=70)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    monkeypatch.setattr(
        quality,
        "score_image",
        lambda path, design_path=None, pose_path=None: (
            84.3,
            {"anatomy": 95, "pose_fidelity": 50, "nail_accuracy": 95, "lighting": 90, "background": 90,
             "realism": 90, "marketing_quality": 90},
        ),
    )

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.passed is False


def test_fidelity_floor_does_not_block_a_pass_when_both_criteria_clear_it(tmp_path, tiny_png_bytes, monkeypatch):
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=80, quality_max_retries=0, quality_fidelity_floor=70)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    monkeypatch.setattr(
        quality,
        "score_image",
        lambda path, design_path=None, pose_path=None: (
            85.0,
            {"anatomy": 85, "pose_fidelity": 80, "nail_accuracy": 80, "lighting": 85, "background": 85,
             "realism": 90, "marketing_quality": 90},
        ),
    )

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.passed is True


def test_build_retry_feedback_is_empty_when_nothing_is_weak():
    breakdown = {"anatomy": 90, "nail_accuracy": 90, "lighting": 90, "background": 90, "realism": 90, "marketing_quality": 90}
    assert _build_retry_feedback(breakdown, threshold=80) == ""


def test_build_retry_feedback_names_only_the_weak_criteria():
    breakdown = {"anatomy": 60, "nail_accuracy": 90, "lighting": 90, "background": 90, "realism": 90, "marketing_quality": 90}
    feedback = _build_retry_feedback(breakdown, threshold=80)
    assert "hand and finger anatomy" in feedback
    assert "nail design must match" not in feedback  # nail_accuracy scored fine, shouldn't be mentioned


def test_generate_with_quality_gate_appends_feedback_to_retry_prompt(tmp_path, tiny_png_bytes, monkeypatch):
    """The core cost-saving behavior: a failed attempt's weak criteria must be
    fed into the next attempt's prompt instead of blindly repeating it."""
    design = tmp_path / "d.png"
    pose = tmp_path / "p.png"
    design.write_bytes(tiny_png_bytes)
    pose.write_bytes(tiny_png_bytes)
    out = tmp_path / "out.png"

    settings = _settings(quality_pass_threshold=80, quality_max_retries=3)
    quality = QualityService(settings)
    image_service = ImageService(settings)

    # Fail attempt 1 on lighting only, then pass on attempt 2.
    responses = iter(
        [
            (50.0, {"anatomy": 90, "nail_accuracy": 90, "lighting": 10, "background": 90, "realism": 90, "marketing_quality": 90}),
            (95.0, {"anatomy": 95, "nail_accuracy": 95, "lighting": 95, "background": 95, "realism": 95, "marketing_quality": 95}),
        ]
    )
    monkeypatch.setattr(quality, "score_image", lambda path, design_path=None, pose_path=None: next(responses))

    result = quality.generate_with_quality_gate(image_service, design, pose, "base prompt", out, variation=1)

    assert result.attempt == 2
    assert result.passed is True
    assert result.prompt_used.startswith("base prompt")
    assert "soft studio lighting" in result.prompt_used
    assert "hand and finger anatomy" not in result.prompt_used  # anatomy passed on attempt 1, no feedback needed
