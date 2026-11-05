"""Non-admin billing journey in disposable fictional homologation resources."""
from smoke_bootstrap_homolog import main
from smoke_operational_journey_homolog import verify as journey


def verify(*args):
    journey(*args, restricted_billing=True)


if __name__ == '__main__':
    main(verify, 'last-restricted-billing.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
