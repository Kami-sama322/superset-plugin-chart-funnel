import os

from superset.config import TALISMAN_CONFIG as DEFAULT_TALISMAN_CONFIG

DEBUG = True
LOG_LEVEL = "DEBUG"

TEMPLATES_AUTO_RELOAD = True

ALLOWED_EXTENSIONS = {"csv", "tsv", "txt", "json"}
ALLOW_DATA_UPLOAD = True

ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": {"*": {"origins": "*"}},
}

PREVENT_UNSAFE_DB_CONNECTIONS = False

WTF_CSRF_ENABLED = False

FEATURE_FLAGS = {
    "DASHBOARD_NATIVE_FILTERS": True,
    "DASHBOARD_CROSS_FILTERING": True,
    "ALLOW_DATA_UPLOAD": True,
}

SUPERSET_WEBSERVER_TIMEOUT = 300

# Funnel compiles Handlebars tooltip templates at runtime, which requires
# 'unsafe-eval' in script-src (see README, CSP requirement).
# With DEBUG=True Superset applies TALISMAN_DEV_CONFIG — keep both in sync.
TALISMAN_ENABLED = True
TALISMAN_CONFIG = DEFAULT_TALISMAN_CONFIG.copy()

TALISMAN_DEV_CONFIG = {
    **TALISMAN_CONFIG,
    "content_security_policy": {
        **TALISMAN_CONFIG["content_security_policy"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    },
}
