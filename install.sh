#!/bin/sh
# Prepares a fresh checkout so startup.sh has something to run. Run once, at
# cell preparation, with the working directory already at the checkout root.
#
# POSIX sh — the system running this invokes it with `sh`, not bash, so a
# bashism here fails at cell preparation with a syntax error and no application.
set -eu

# `npm ci`, not `npm install`: package-lock.json is committed, and `npm ci`
# installs exactly the versions it pins and stops if the lockfile and
# package.json disagree. `npm install` is free to resolve a newer `ws` into the
# cell and rewrite the lockfile, so the cell would run a dependency tree nobody
# here has ever started the server against.
npm ci
