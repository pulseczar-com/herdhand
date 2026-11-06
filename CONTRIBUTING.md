# Contributing

Thank you for helping with Herdhand.

## Before you start

- The app grows one small step at a time. Open an issue before a large change.
- Set up the project as the [README](README.md#build-and-run) shows.

## Making a change

1. Write the test first for a change in behavior.
2. Run `just check` (typecheck, lint and tests) before each commit.
3. Prefer the JavaScript dev server. A change to `modules/ssh` or to a native package needs a new development build (`just build-dev`).
4. Keep personal details out of the repository: no names, email addresses, user names, host names, IP addresses, home paths or private links. Use placeholders such as `example.com`.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line, which certifies the [Developer Certificate of Origin](https://developercertificate.org/):

```sh
git commit -s
```

By signing off, you state that you wrote the change or have the right to submit it under the project's license (Apache License 2.0).
