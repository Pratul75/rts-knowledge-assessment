# RTS Knowledge Assessment

A timed, auto-graded online test on the RTS / Recharge presentation library (ATL communication, BTL activation, digital, events, GTM, PPT design, agency credentials and scripts).

- **Duration:** 60 minutes, auto-submits at time-up
- **Marks:** 100 (50 single-answer MCQs × 2 marks, no negative marking)
- **Hosting:** static site on GitHub Pages, no backend

## For the candidate
Open the site, enter your name, press **Start**. Answer in any order, mark questions for review, then **Submit paper**. The result page shows the score and a **result code**. Email it to the examiner (button) or copy and send it on WhatsApp.

Answers are saved in the browser, so a reload does not lose progress or reset the timer.

## For the examiner
Open `?examiner=1` (link in the footer). Paste the candidate's result code and the examiner passphrase to:
- re-verify the score independently of what the candidate's screen showed,
- see every question with the answer given, the correct answer and the source deck.

**Show full answer key** prints the key with the passphrase.

To let a candidate retake on the same browser, open `?reset=1`.

## How grading works without a server
`questions.json` holds the questions and a salted SHA-256 hash of each correct option. The browser hashes the chosen option and compares. `key.enc.json` is the plain answer key encrypted with AES-GCM under the examiner passphrase (PBKDF2, 200k iterations). The unencrypted source `questions_source.json` is git-ignored and never published.

Limitation: with only four options per question the hashes can be brute-forced by someone who reads the JavaScript. This deters casual peeking, not a determined technical candidate.

## Editing questions
1. Edit `questions_source.json` (kept locally, not in git).
2. `pip install cryptography` once, then `python3 tools/build.py "<examiner passphrase>"`.
3. Commit `questions.json` and `key.enc.json`, push.
