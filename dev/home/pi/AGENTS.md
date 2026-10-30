# Coding conventions

Keep comments sparse and useful. Explain why a non-obvious decision exists, not what the code plainly does.

Prefer models that make invalid states unrepresentable.

Keep the solution direct and proportionate. Avoid speculative defenses, duplicate checks, flags, custom infrastructure, abstractions, and refactors that do not solve a real problem. Prefer the simplest design that preserves the required behavior.

## Tests

- Tests should not test implementation details; an implementation should be able to change while the test remains the same. In effect, this means less mocking.
- Tests must do what their name suggests
- Generally test one logical concern per test

## Kotlin

Prefer clear names, named arguments where they improve mapping readability, and straightforward collection operations.
Avoid mutable accumulation and placeholder IDs when a small intermediate model or mapper expresses the real lifecycle better.

When appropriate, compare the complete expected model instead of asserting many fields separately. Use the project’s test fixtures and real integration paths.

Do not add `require` checks for conditions already guaranteed by the surrounding logic.

