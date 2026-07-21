from pathlib import Path
from types import SimpleNamespace

from app.config import Settings
from app.services import agy_service


def test_build_agy_prompt_preserves_reference_order(tmp_path):
    pose = tmp_path / "pose.png"
    design = tmp_path / "design.png"

    prompt = agy_service._build_agy_prompt("make nails", [pose, design])

    assert prompt.index(str(pose.resolve())) < prompt.index(str(design.resolve()))
    assert "default_api:generate_image" in prompt
    assert "RESULT|<absolute_artifact_path>" in prompt


def test_parse_agy_result_path():
    result = agy_service._parse_artifact_path('RESULT|C:\\Users\\test\\.gemini\\ima2_generated.png|png')

    assert result == Path("C:\\Users\\test\\.gemini\\ima2_generated.png")


def test_run_agy_passes_prompt_as_cli_argument(monkeypatch):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return SimpleNamespace(stdout="PROMPT_OK", stderr="", returncode=0)

    monkeypatch.setattr(agy_service, "_resolve_agy_bin", lambda configured: "agy.exe")
    monkeypatch.setattr(agy_service.subprocess, "run", fake_run)

    output = agy_service._run_agy("generate this image", Settings(image_provider="agy", agy_model=""))

    assert captured["args"] == ["agy.exe", "-p", "generate this image"]
    assert "input" not in captured["kwargs"]
    assert output.strip() == "PROMPT_OK"


def test_run_agy_passes_model_flag_when_configured(monkeypatch):
    captured = {}

    def fake_run(args, **kwargs):
        captured["args"] = args
        return SimpleNamespace(stdout="PROMPT_OK", stderr="", returncode=0)

    monkeypatch.setattr(agy_service, "_resolve_agy_bin", lambda configured: "agy.exe")
    monkeypatch.setattr(agy_service.subprocess, "run", fake_run)

    agy_service._run_agy("generate this image", Settings(image_provider="agy", agy_model="gemini-3.1-pro-high"))

    assert captured["args"] == ["agy.exe", "-p", "generate this image", "--model", "gemini-3.1-pro-high"]


def test_generate_via_agy_reads_and_removes_artifact(monkeypatch, tmp_path, tiny_png_bytes):
    artifact = tmp_path / "ima2_generated.png"
    artifact.write_bytes(tiny_png_bytes)
    monkeypatch.setattr(agy_service, "_run_agy", lambda prompt, settings: f"RESULT|{artifact}|png")

    result = agy_service.generate_via_agy("test", [], Settings(image_provider="agy"))

    assert result == tiny_png_bytes
    assert not artifact.exists()
