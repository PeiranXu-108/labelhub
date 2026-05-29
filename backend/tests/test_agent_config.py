from app.agent.config import _dotenv_values, load_llm_provider_config


def test_deepseek_is_the_default_live_review_provider(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_TEMPERATURE", raising=False)
    monkeypatch.delenv("LABELHUB_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LABELHUB_LLM_MODEL", raising=False)
    monkeypatch.delenv("LABELHUB_LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LABELHUB_LLM_TEMPERATURE", raising=False)
    monkeypatch.setenv("LABELHUB_LLM_API_KEY", "deepseek-test-key")

    config = load_llm_provider_config()

    assert config.provider == "deepseek"
    assert config.model == "deepseek-chat"
    assert config.base_url == "https://api.deepseek.com"
    assert config.api_key == "deepseek-test-key"
    assert config.temperature == 0
    assert config.has_credentials is True


def test_llm_config_reads_labelhub_prefixed_dotenv(monkeypatch, tmp_path):
    for name in (
        "LLM_PROVIDER",
        "LLM_MODEL",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "LLM_TEMPERATURE",
        "LABELHUB_LLM_PROVIDER",
        "LABELHUB_LLM_MODEL",
        "LABELHUB_LLM_BASE_URL",
        "LABELHUB_LLM_API_KEY",
        "LABELHUB_LLM_TEMPERATURE",
    ):
        monkeypatch.delenv(name, raising=False)
    (tmp_path / ".env").write_text(
        "\n".join(
            [
                "LABELHUB_LLM_PROVIDER=deepseek",
                "LABELHUB_LLM_MODEL=deepseek-chat",
                "LABELHUB_LLM_BASE_URL=https://api.deepseek.com",
                "LABELHUB_LLM_API_KEY=dotenv-key",
                "LABELHUB_LLM_TEMPERATURE=0.2",
            ]
        )
    )
    monkeypatch.chdir(tmp_path)
    _dotenv_values.cache_clear()

    config = load_llm_provider_config()

    assert config.api_key == "dotenv-key"
    assert config.temperature == 0.2
