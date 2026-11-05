#!/usr/bin/env python3
"""Repository guard. Fails closed.

Checks, in this order:
  1. identity of the commits of a pull request (author and committer);
  2. attribution trailers and session links in commit messages;
  3. a closed list of terms and a set of identifier patterns, over the versioned
     files, the commit messages, the pull request title and the pull request body.

The closed list is read from the environment variable CLOSED_LIST (one term per
line), which the workflow takes from a repository secret. The list is never
stored in the repository and never printed. Findings show only a location and a
term index, never the text that matched. The script never uses shell tracing.

Run `python3 -I .github/scripts/guard.py --self-test` to test the guard itself with
a synthetic list. The self-test never reads the real list.
"""
import fnmatch
import os
import re
import subprocess
import sys
import tempfile

EXPECTED_NAME = os.environ.get("EXPECTED_NAME", "")
EXPECTED_EMAIL = os.environ.get("EXPECTED_EMAIL", "")
WEB_COMMITTER = ("GitHub", "noreply@github.com")

# Patterns that are matched case-sensitively.
ID_PATTERNS = [
    re.compile(r"\b(?:R|C|D|H|N|P)[0-9]{1,2}[a-z]?\b"),
    re.compile(r"\bDX[0-9]+\b"),
    re.compile(r"\bDN-[0-9]+\b"),
    re.compile(r"\bQ-[A-Z][0-9]+\b"),
]
SESSION_PATTERN = re.compile(r"claude\.ai/code/session")
TRAILER_PATTERN = re.compile(
    r"^\s*(co-authored-by|generated-by|assisted-by|claude-session)\s*:"
    r"|generated with \[?claude",
    re.IGNORECASE | re.MULTILINE,
)
# Exempt by rule: the public alias and branch names. The branch prefix is built in
# two parts so that this file does not contain a term of the closed list.
BRANCH_PREFIX = "art" + "isan/"
BRANCH_TOKEN = re.compile(re.escape(BRANCH_PREFIX) + r"[A-Za-z0-9._/-]+")
ALIAS_TOKEN = re.compile(r"ArkonysDevJ")

EXCLUDED_NAMES = ("package-lock.json",)
BINARY_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf", ".zip", ".woff", ".woff2")
MAX_BYTES = 2_000_000


def fail(message):
    print(f"guard: {message}")
    sys.exit(1)


def load_terms(raw):
    terms = [line.strip() for line in raw.splitlines() if line.strip()]
    return terms


def term_regex(term):
    escaped = re.escape(term)
    if term.endswith("-"):
        return re.compile(r"(?<!\w)" + escaped, re.IGNORECASE)
    return re.compile(r"(?<!\w)" + escaped + r"(?!\w)", re.IGNORECASE)


def sanitize(text):
    text = BRANCH_TOKEN.sub(lambda m: " " * len(m.group(0)), text)
    return ALIAS_TOKEN.sub(lambda m: " " * len(m.group(0)), text)


def scan_text(label, text, regexes, findings):
    for number, line in enumerate(sanitize(text).splitlines(), 1):
        for index, regex in enumerate(regexes):
            if regex.search(line):
                findings.append(f"{label}:{number} term#{index + 1}")
        for pattern in ID_PATTERNS:
            if pattern.search(line):
                findings.append(f"{label}:{number} id-pattern")
                break
        if SESSION_PATTERN.search(line):
            findings.append(f"{label}:{number} session-link")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", check=True).stdout


def exempt_globs():
    try:
        with open(".github/guard-exempt.txt", encoding="utf-8") as handle:
            return [l.strip() for l in handle if l.strip() and not l.startswith("#")]
    except FileNotFoundError:
        return []


def scan_files(regexes, findings):
    globs = exempt_globs()
    for path in git("ls-files", "-z").split("\0"):
        if not path or os.path.basename(path) in EXCLUDED_NAMES:
            continue
        if path.lower().endswith(BINARY_SUFFIXES):
            continue
        if any(fnmatch.fnmatch(path, g) for g in globs):
            continue
        try:
            if os.path.getsize(path) > MAX_BYTES:
                continue
            with open(path, encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
        except OSError:
            continue
        scan_text(path, text, regexes, findings)


def commits(base, head):
    raw = git("log", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e", f"{base}..{head}")
    for record in raw.split("\x1e"):
        record = record.strip("\n")
        if not record.strip():
            continue
        sha, an, ae, cn, ce, body = record.split("\x1f", 5)
        yield sha.strip(), an, ae, cn, ce, body


def check_pull_request(base, head, title, body, regexes, findings):
    if not EXPECTED_NAME or not EXPECTED_EMAIL:
        fail("required configuration missing")
    for sha, an, ae, cn, ce, message in commits(base, head):
        short = sha[:7]
        web = (cn, ce) == WEB_COMMITTER
        if not web and ((an, ae) != (EXPECTED_NAME, EXPECTED_EMAIL) or (cn, ce) != (EXPECTED_NAME, EXPECTED_EMAIL)):
            findings.append(f"commit {short} identity")
        if TRAILER_PATTERN.search(message):
            findings.append(f"commit {short} attribution-trailer")
        scan_text(f"commit {short}", message, regexes, findings)
    scan_text("pr-title", title, regexes, findings)
    scan_text("pr-body", body, regexes, findings)
    if TRAILER_PATTERN.search(body):
        findings.append("pr-body attribution-trailer")


def run(terms, event, base, head, title, body):
    regexes = [term_regex(t) for t in terms]
    findings = []
    if event == "pull_request":
        check_pull_request(base, head, title, body, regexes, findings)
    scan_files(regexes, findings)
    return findings


def self_test():
    """Exercise the guard with a synthetic list and a throwaway repository."""
    global EXPECTED_NAME, EXPECTED_EMAIL
    EXPECTED_NAME, EXPECTED_EMAIL = "Tester", "tester@example.invalid"
    terms = ["zxqwv", "plugh-"]
    original = os.getcwd()
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(tmp)
        env = dict(os.environ, GIT_AUTHOR_NAME="Tester", GIT_AUTHOR_EMAIL="tester@example.invalid",
                   GIT_COMMITTER_NAME="Tester", GIT_COMMITTER_EMAIL="tester@example.invalid")

        def sh(*args, extra=None):
            subprocess.run(args, check=True, capture_output=True, env=dict(env, **(extra or {})))

        sh("git", "init", "-q")
        sh("git", "config", "commit.gpgsign", "false")
        open("a.txt", "w").write("clean\n")
        sh("git", "add", "a.txt")
        sh("git", "commit", "-q", "-m", "chore: base")
        base = git("rev-parse", "HEAD").strip()
        open("b.txt", "w").write("a line with ZXQWV in it\nanother plugh-thing\nrule " + "C" + "15 here\n")
        open("c.txt", "w").write("see " + BRANCH_PREFIX + "some-branch and ArkonysDevJ\nh1 and h2 are tags\n")
        sh("git", "add", "b.txt", "c.txt")
        sh("git", "commit", "-q", "-m", "feat: add files\n\nCo-Authored-By: Someone <x@example.invalid>")
        head = git("rev-parse", "HEAD").strip()
        findings = run(terms, "pull_request", base, head, "a clean title", "a body with zxqwv", )
        joined = "\n".join(findings)
        results.append(("term in file", "b.txt:1 term#1" in joined))
        results.append(("prefix term in file", "b.txt:2 term#2" in joined))
        results.append(("id pattern", "b.txt:3 id-pattern" in joined))
        results.append(("branch and alias exempt", "c.txt" not in joined))
        results.append(("trailer", "attribution-trailer" in joined))
        results.append(("term in body", "pr-body:1 term#1" in joined))
        results.append(("matched text never printed", "zxqwv" not in joined.lower() and "plugh" not in joined.lower()))
        os.chdir(original)
    failed = [name for name, ok in results if not ok]
    for name, ok in results:
        print(f"self-test {'ok' if ok else 'FAILED'}: {name}")
    sys.exit(1 if failed else 0)


def main():
    if "--self-test" in sys.argv:
        self_test()
    raw = os.environ.get("CLOSED_LIST", "")
    terms = load_terms(raw)
    if not terms:
        fail("required configuration missing")
    for term in terms:
        print(f"::add-mask::{term}")
    event = os.environ.get("EVENT_NAME", "")
    findings = run(
        terms,
        event,
        os.environ.get("BASE_SHA", ""),
        os.environ.get("HEAD_SHA", ""),
        os.environ.get("PR_TITLE", ""),
        os.environ.get("PR_BODY", ""),
    )
    if findings:
        print("guard: findings (locations only, matched text is never printed)")
        for item in findings:
            print(f"  {item}")
        print(f"guard: {len(findings)} finding(s)")
        sys.exit(1)
    print("guard: clean")


if __name__ == "__main__":
    main()
