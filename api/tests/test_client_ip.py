"""client_ip: the shared-secret bypass must survive non-ASCII header bytes (04 §Auth)."""

from fastapi import FastAPI
from starlette.requests import Request

from app.infra.client_ip import client_ip
from tests.settings import make_settings


def make_request(app: FastAPI, secret_header: bytes) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [
            (b"x-internal-secret", secret_header),
            (b"x-client-ip", b"5.5.5.5"),
            (b"x-forwarded-for", b"7.7.7.7"),
        ],
        "client": ("1.1.1.1", 1),
        "app": app,
    }
    return Request(scope)


def test_non_ascii_secret_falls_through_without_raising(app: FastAPI) -> None:
    app.state.settings = make_settings(revalidate_secret="s3cret")
    request = make_request(app, "é".encode())
    assert client_ip(request) == "7.7.7.7"


def test_matching_secret_trusts_the_client_ip_header(app: FastAPI) -> None:
    app.state.settings = make_settings(revalidate_secret="s3cret")
    request = make_request(app, b"s3cret")
    assert client_ip(request) == "5.5.5.5"


def test_no_secret_configured_falls_back_to_forwarded_for(app: FastAPI) -> None:
    app.state.settings = make_settings(revalidate_secret=None)
    request = make_request(app, b"s3cret")
    assert client_ip(request) == "7.7.7.7"
