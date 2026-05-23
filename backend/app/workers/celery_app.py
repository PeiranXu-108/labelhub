from app.core.config import get_settings


try:
    from celery import Celery
except ModuleNotFoundError:
    Celery = None


settings = get_settings()

if Celery is not None:
    celery_app = Celery(
        "labelhub",
        broker=settings.redis_url,
        backend=settings.redis_url,
        include=["app.workers.ai_review", "app.workers.exports"],
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
    )
else:

    class _MissingCeleryApp:
        def task(self, *args, **kwargs):
            def decorator(func):
                func.delay = lambda *delay_args, **delay_kwargs: None
                return func

            return decorator

    celery_app = _MissingCeleryApp()
