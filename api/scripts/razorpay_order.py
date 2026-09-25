"""Create one real Razorpay test-mode order with the keys in api/.env.local and print its id
(B4's "done when"). Touches no database; the order simply expires unpaid in the dashboard.

    uv run python -m scripts.razorpay_order            # ₹1.00
    uv run python -m scripts.razorpay_order --paise 250000
    uv run python -m scripts.razorpay_order --env-file ../../../api/.env.local   # from a worktree

Refuses a live key: Tripsmith runs Razorpay in test mode forever.
"""

import argparse
import asyncio
import secrets
import sys

from app.config import Settings
from app.infra.razorpay import Razorpay, RazorpayError


async def main(paise: int, env_file: str) -> int:
    settings = Settings(_env_file=env_file)  # pyright: ignore[reportCallIssue]
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        print(f"RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in {env_file}", file=sys.stderr)
        return 1
    if not settings.razorpay_key_id.startswith("rzp_test_"):
        print("Refusing: that is not a test-mode key (rzp_test_…)", file=sys.stderr)
        return 1
    client = Razorpay(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value())
    receipt = "SCRIPT-" + secrets.token_hex(4).upper()
    try:
        order_id = await client.create_order(amount_paise=paise, receipt=receipt)
    except RazorpayError as exc:
        print(f"Order failed: {exc}", file=sys.stderr)
        return 1
    print(f"{order_id}  ({paise} paise, receipt {receipt})")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create one Razorpay test-mode order")
    parser.add_argument("--paise", type=int, default=100, help="amount in paise (min 100)")
    parser.add_argument("--env-file", default=".env.local", help="dotenv file with the keys")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.paise, args.env_file)))
