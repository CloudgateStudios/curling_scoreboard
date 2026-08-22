# Firestore rules tests

Exercises `firestore.rules` against the Firestore emulator, checking both that
the app's real access patterns still work and that the paths we intend to block
stay blocked.

## Running

```sh
npm install
npm test
```

The emulator needs a Java runtime. macOS ships a stub `java` that only prints
an installation prompt, so if you see

```
Error: Process `java -version` has exited with code 1.
```

point `JAVA_HOME` at a real JDK. Android Studio bundles one:

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

## Checking a different rules file

Pass a path to compare against, which is useful for confirming a change
actually closes something:

```sh
firebase emulators:exec --only firestore --project rules-test \
  "node rules.test.mjs /path/to/other.rules"
```

## What is covered

Access the app depends on:

- the pairing `collectionGroup` query filtered by pairing code
- a device claiming a sheet for itself
- reading the club document for its name during pairing
- a paired scoreboard pushing `liveGame` and writing a completed game
- a paired scoreboard clearing its own uid on disconnect

Access that must stay denied:

- an unfiltered `collectionGroup` query over every sheet
- reading another club's paired sheet directly
- claiming an open sheet on behalf of a different uid
- reassigning a paired sheet to another device

The script exits non-zero if any expectation is not met, so it can be wired
into CI later. That needs a Java runtime on the runner, which is why it is not
part of `validate_pr.yaml` yet.
