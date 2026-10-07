#!/usr/bin/env python3
"""
S3 UI mutation proof: restore the old fallback and confirm the tests go red.

    python3 scripts/s3-ui-mutation-proof.py

A passing test suite is evidence about the suite, not about the defect. The
only thing that shows NotificationSender.test.tsx actually bites is putting the
bug back and watching it fail -- and CLAUDE.md's rule for THIS repo is that the
first mutation is always reverting the exact defect, not a variation on it.

EVERY ARM ASSERTS THE MUTATION LANDED BEFORE IT INTERPRETS THE RESULT.
This repo has two recorded proofs that silently never mutated: a zsh
word-splitting bug that ran a 17-file loop exactly once, and an arm whose
`replace()` matched nothing because of an escaped slash. Both reported a
verdict anyway. Without the `assert after != before` the conclusion does not
depend on the proof having been performed, and a green run is indistinguishable
from a mutation that never happened.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SENDER = ROOT / "app/notifications/NotificationSender.tsx"
PAGE = ROOT / "app/notifications/page.tsx"

ARMS = [
    {
        "name": "M1 restore the exact old fallback (no avatar -> system icon)",
        "file": SENDER,
        "find": "if (!hasHumanSender(notification)) {",
        "repl": "if (!notification.actor?.avatar_url) {",
        "tests": ["app/notifications/NotificationSender.test.tsx"],
    },
    {
        "name": "M2 key the branch on the joined actor instead of actor_id",
        "file": SENDER,
        "find": "return n.actor_id !== null && n.actor_id !== undefined;",
        "repl": "return n.actor != null;",
        "tests": ["app/notifications/NotificationSender.test.tsx"],
    },
    {
        "name": "M3 drop the sender name entirely",
        "file": SENDER,
        "find": "  return unknownSenderLabel;",
        "repl": "  return null;",
        "tests": ["app/notifications/NotificationSender.test.tsx"],
    },
    {
        "name": "M4 page renders the old ternary again (call-site guard)",
        "file": PAGE,
        "find": "<NotificationSender notification={notification} unknownSenderLabel={unknownSenderLabel} />",
        "repl": "{notification.actor?.avatar_url ? <img src={notification.actor.avatar_url} /> : TYPE_ICONS[notification.type]}",
        "tests": ["app/notifications/NotificationSender.callsite.test.ts"],
    },
]


def run_tests(paths):
    r = subprocess.run(
        ["npx", "vitest", "run", *paths],
        cwd=ROOT, capture_output=True, text=True,
    )
    return r.returncode


def main():
    failures = []
    for arm in ARMS:
        p = arm["file"]
        orig = p.read_text()

        # 1. there is something to mutate
        if arm["find"] not in orig:
            print(f"  ERROR {arm['name']}: anchor not found -- the proof is stale, not the code")
            failures.append(arm["name"])
            continue

        p.write_text(orig.replace(arm["find"], arm["repl"], 1))

        # 2. THE MUTATION ACTUALLY LANDED. This is the load-bearing assertion.
        after = p.read_text()
        assert after != orig, f"{arm['name']}: file unchanged after replace"

        try:
            code = run_tests(arm["tests"])
        finally:
            # 3. restore, pass or fail
            p.write_text(orig)
            assert p.read_text() == orig, f"{arm['name']}: RESTORE FAILED -- tree is dirty"

        if code != 0:
            print(f"  CAUGHT  {arm['name']}")
        else:
            print(f"  MISSED  {arm['name']}  <-- the guard does not bite")
            failures.append(arm["name"])

    print()
    if failures:
        print(f"{len(failures)} mutation(s) NOT caught: {failures}")
        return 1
    print(f"all {len(ARMS)} mutations caught; tree restored")
    return 0


if __name__ == "__main__":
    sys.exit(main())
