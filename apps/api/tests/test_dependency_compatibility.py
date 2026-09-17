"""Compatibility boundaries that matter when replacing security libraries."""
import base64
import hashlib
import hmac
import json
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import jwt

from src.adapters.security.jwt_auth_service import JwtAuthService


class JwtCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.key = 'fictitious-compatibility-test-key-32-characters'
        with patch('src.adapters.security.jwt_auth_service.get_settings', return_value=SimpleNamespace(
                jwt_secret_key=self.key, jwt_expire_minutes=60)):
            self.auth = JwtAuthService()

    def legacy_hs256(self, claims, key=None, algorithm='HS256'):
        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        signing_input = encode({'alg': algorithm, 'typ': 'JWT'}) + b'.' + encode(claims)
        signature = hmac.new((key or self.key).encode(), signing_input, hashlib.sha256).digest()
        return (signing_input + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()

    def claims(self):
        return {'sub': 'fictitious-user', 'jti': 'fictitious-session', 'iat': int(time.time()), 'exp': int(time.time())+60}

    def test_existing_hs256_wire_format_is_preserved(self):
        claims = self.claims()
        self.assertEqual(self.auth.decode_access_token(self.legacy_hs256(claims)), claims)

    def test_wrong_key_algorithm_expiration_and_malformed_tokens_are_rejected(self):
        for token in (self.legacy_hs256(self.claims(), key='different-test-secret'),
                self.legacy_hs256(self.claims(), algorithm='none'),
                jwt.encode(self.claims(), self.key, algorithm='HS512'),
                self.legacy_hs256({**self.claims(), 'exp': int(time.time())-1}), 'invalid', ''):
            with self.subTest(): self.assertIsNone(self.auth.decode_access_token(token))

    def test_new_tokens_round_trip_with_required_session_claims(self):
        token = self.auth.create_access_token('fictitious-user', {'jti': 'fictitious-session'})
        claims = self.auth.decode_access_token(token)
        self.assertEqual(claims['jti'], 'fictitious-session')
        self.assertEqual(claims['sub'], 'fictitious-user')
