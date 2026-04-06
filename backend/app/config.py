from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://recruiter:recruiter@postgres:5432/recruiter_outreach"
    nylas_client_id: str = ""
    nylas_api_key: str = ""
    nylas_api_uri: str = "https://api.us.nylas.com"
    nylas_callback_uri: str = "http://localhost:8000/api/auth/callback"
    openai_api_key: str = ""
    frontend_url: str = "http://localhost:5173"
    jwt_secret: str = "change-me-in-production"
    environment: str = "development"  # "development" or "production"

    class Config:
        env_file = ".env"


settings = Settings()

# Validate JWT secret in production
if settings.environment == "production" and settings.jwt_secret == "change-me-in-production":
    raise ValueError("JWT_SECRET must be changed in production! Set a strong random secret.")
