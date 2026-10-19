import unittest
from src.core.domain.cpf import same_cpf, validate_cpf
from src.core.domain.exceptions import ValidationError


class CpfTests(unittest.TestCase):
    def test_valid_and_absent(self):
        for value in (None, '', '  ', '12345678909', '123.456.789-09', '98765432100', '123 456 789 09'):
            with self.subTest(value=value):
                validate_cpf(value)

    def test_invalid(self):
        for value in ('123', '123456789012', 'DOC-12345678909', '12345678901', '12345678919', '12345678900',
                      '00000000000', '11111111111', '１２３４５６７８９０９'):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_cpf(value)

    def test_legacy_equivalence_does_not_equate_distinct_mixed_values(self):
        self.assertTrue(same_cpf(' OLD-123 ', 'OLD-123'))
        self.assertTrue(same_cpf('123.456.789-01', '12345678901'))
        self.assertFalse(same_cpf('OLD-456', 'OLD-123'))
        self.assertFalse(same_cpf('12345678901', 'OLD-12345678901'))
