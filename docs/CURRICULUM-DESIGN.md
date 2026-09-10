# Curriculum design record

The audience is a complete beginner using clear English. The current 18-lab path
starts at Lab 00, with account progress and embedded terminals on one computer.
Lab 10 adds a guided message-recovery elective after Lab 01. Scenarios, objectives,
hints, checks, and flag submission are integrated at `/labs`; eighteen older
shared-range modules are explicitly labeled legacy at `/legacy`.

Lab 10 distinguishes encoding (Base64 and hex), fixed substitution (ROT13),
dictionary guessing against an MD5 digest, and keyed decryption (toy repeating-key
XOR). The five-word dictionary and every secret are fictional. The final SHA-256
check verifies recovery, not authenticated encryption; the lesson explicitly
rejects MD5 password storage and toy XOR for real applications.

## Research basis

TryHackMe's Pre Security path introduces computer, operating-system, network, and
web concepts before attack practice. Its room guidance distinguishes explained
walkthroughs from independent challenges. We apply concept briefings and gradually
reduce prompts. Sources: [Pre Security](https://tryhackme.com/path/outline/beginner)
and [room difficulty](https://help.tryhackme.com/en/articles/6611846-room-difficulty-levels).

Root-Me describes a challenge environment with supporting resources and multiple
solutions. We apply explicit outcomes, prerequisites, and solutions for every
objective. Source: [Root-Me](https://www.root-me.org/?lang=en).

WebVerse presents company-based web environments and vulnerability chains. We
apply a fictional organization, useful public clues, benign pages, and a final
investigation combining earlier evidence. Source:
[WebVerse](https://webverselabs-pro.com/).

These are our design choices based on public platform material; no paid room
content or third-party challenge assets are copied.

## Teaching contract

Each README separates the scenario, new concepts, startup, objectives, per-flag
progressive hints, complete solution, takeaways, and cleanup. Each tool choice
must answer an investigation question. A flag indicates a checkpoint; it does
not prove that a learner ran a particular command. Final endpoints validate case
evidence, while local CLI verification enforces objective dependencies.

The manifest fields campaign, mode, prerequisites, learningOutcomes, difficulty,
and difficultyBand describe the curriculum. Prerequisites recommend preparation
without blocking independent lab startup. Modes are guided, challenge, and
capstone. The broad `difficulty` value remains `beginner`, `intermediate`, or
`advanced` for compatibility; `difficultyBand` records the teaching tier below.

## Difficulty rubric

- **beginner:** 0–2 new concepts, one primary tool family, no more than two
  independent decisions, no prerequisite beyond terminal orientation, and a
  directly observable flag in roughly 15–35 minutes.
- **beginner-plus:** 2–4 concepts building on one prior lab, two or three tool
  families, one meaningful tool or interpretation choice, and a distinction
  such as banner versus proof in roughly 30–60 minutes.
- **intermediate-foundations:** 4–7 concepts in one domain, at least three tools
  or one protocol plus an evidence format, and two combined observations with
  at least one indirect clue in roughly 45–90 minutes.
- **intermediate-capstone:** reuses at least three prior skills, correlates
  multiple sources, includes ambiguity or a competing interpretation, and ends
  with evidence, impact, confidence, and remediation in roughly 60–120 minutes.
- **intermediate-crypto-foundations:** requires byte or encoding reasoning,
  distinguishes encoding, hashing, encryption, integrity, and authenticity,
  and explains why any intentionally weak primitive is not production-safe.
- **advanced:** reserves more than 120 minutes for non-linear investigation,
  multiple defensible approaches, substantial ambiguity, or cross-domain work.
  Length or number of commands alone never makes a lab advanced.

The first campaign covers infrastructure and evidence, ending at Lab 06. The
second covers ApertureOps and ends at Lab 09. Case artifacts are self-contained;
one lab never requires another lab's containers or rotating flags.

## Compatibility and simulations

Lab IDs, objective IDs, flag environment names, and CLI syntax remain stable.
Titles and stage descriptions change. Reset a previously started lab for fresh curriculum
evidence. Lab 09 retains its final objective ID but now requires a decoded
configuration, log hash, actor, event, and case as well as earlier tokens.

Raw TCP listeners and DNS query/transfer services are real local protocols.
Some product banners are synthetic. The Lab 07 HTML reflection is observable,
but the ticket reviewer uses a deterministic training rule rather than executing
a browser. JWT escalation grants only simulated application admin access.
Encoding exercises use real base64, tar, and SHA-256 operations.

## Verification

Validate manifest graphs and README objective coverage in the unit suite.
Exercise documented protocols and wrong-report rejection in Docker smoke tests.
The release runner deliberately resets the selected lab, then checks flag
dependencies, repeated start, stop/resume without losing progress, old-run
rejection, reset, new evidence, and cleanup. This is a destructive maintainer
check, not a learner step. Local-only expected flags are transient
test inputs and never part of the normal toolbox environment.
