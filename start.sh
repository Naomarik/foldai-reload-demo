#!/bin/sh
# **How this project starts.** The project says it; nothing outside the
# repository decides it.
#
# **Where the product will look for this file, and what it will call it, is not
# settled** — the shape was decided ("a simple script scoped to each project, the
# script defines the startup") and `spec/` now carries it, but the path is not
# this script's to assume. It is invoked by name.
set -eu

# ── the port ────────────────────────────────────────────────────────────────
# **The port the server listens on inside its cell.** `.foldai/application.edn`
# declares the same number to the product, and the origin proxies to it; this
# default keeps the two agreeing when nothing sets it.
: "${PORT:=5210}"

# ── the address, and it must NOT come from `hostname -i` ────────────────────
# **Measured 2026-08-10, in this cell, by this script getting it wrong.**
# `hostname -i` returned **`127.0.1.1`** — Debian maps the hostname to a loopback
# address in `/etc/hosts`, and `hostname -i` resolves the *name* rather than
# reading an *interface*. The cell's real address was on `eth0` the whole time.
#
# > **`ip -4 -br addr show` answers *what address does this interface hold*.
# > `hostname -i` answers *what does the hosts file say about this name*.**
# > They agree on enough systems to be mistaken for one question.
#
# **Why it matters here and not in most places:** `server.js` binds `127.0.0.1`
# unless told otherwise and **never `0.0.0.0`, by design**. The origin proxies in
# from outside the cell. **A server bound to loopback inside a cell is invisible
# to the proxy in front of it and looks perfectly healthy from inside** — no
# error at either end, and a `502` whose cause is two layers away.
#
# **And nothing hands a cell its own address**, which is the product-side half:
# a cell's environment carries the credential broker's address and nothing about
# where to listen. Until it does, a start script has to look.
if [ -z "${HOST:-}" ]; then
  HOST=$(ip -4 -br addr show scope global 2>/dev/null | awk '{print $3}' | cut -d/ -f1 | head -1)
fi
[ -n "${HOST:-}" ] || { echo "start.sh: no global IPv4 address on any interface — set HOST" >&2; exit 2; }

# ── dependencies ────────────────────────────────────────────────────────────
# **The script installs what the project needs, which is what *the script
# defines the startup* means.** `node_modules` is not in the repository and the
# server imports `ws`.
#
# **Egress was measured before this line was written**, rather than assumed: from
# inside a cell, `https://registry.npmjs.org/ws` answers **HTTP 200**, ~15 ms
# connect, unforced over IPv4. **A cell can install its own dependencies.**
if [ ! -d node_modules ]; then
  echo "start.sh: installing dependencies"
  npm install --no-audit --no-fund
fi

export PORT HOST
echo "start.sh: node server.js on $HOST:$PORT"
exec node server.js
