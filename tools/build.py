"""Build questions.json (public, hashed answers) and key.enc.json (encrypted answer key)
from questions_source.json (private, git-ignored).
Usage: python3 tools/build.py <passphrase>
Requires: pip install cryptography
"""
import json, hashlib, secrets, base64, sys
from pathlib import Path
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path(__file__).resolve().parent.parent
src = json.loads((root / "questions_source.json").read_text())
passphrase = sys.argv[1]
salt = secrets.token_hex(16)
pub = {"title": src["title"], "duration_min": src["duration_min"], "salt": salt, "questions": []}
key = {}
total = 0
for q in src["questions"]:
    assert 0 <= q["answer"] < len(q["options"]), q["id"]
    h = hashlib.sha256(f"{salt}|{q['id']}|{q['answer']}".encode()).hexdigest()
    pub["questions"].append({"id": q["id"], "section": q["section"], "text": q["text"], "options": q["options"], "marks": q["marks"], "h": h})
    key[q["id"]] = {"a": q["answer"], "src": q.get("source", "")}
    total += q["marks"]
ids = [q["id"] for q in src["questions"]]
assert len(ids) == len(set(ids)), "duplicate ids"
(root / "questions.json").write_text(json.dumps(pub, ensure_ascii=False, indent=1))

ksalt = secrets.token_bytes(16); iv = secrets.token_bytes(12); iters = 200_000
kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=ksalt, iterations=iters)
k = kdf.derive(passphrase.encode())
ct = AESGCM(k).encrypt(iv, json.dumps(key, ensure_ascii=False).encode(), None)
b = lambda x: base64.b64encode(x).decode()
(root / "key.enc.json").write_text(json.dumps({"salt": b(ksalt), "iv": b(iv), "iter": iters, "ct": b(ct)}))
print(f"built {len(ids)} questions, {total} marks, duration {src['duration_min']} min")
