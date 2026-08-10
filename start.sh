#!/bin/sh
# **How this project starts.** The project says it; nothing outside the
# repository decides it.
#
# **Where the product will look for this file, and what it will call it, is not
# settled yet** — it was decided as a shape today ("a simple script scoped to each
# project, the script defines the startup") and `spec/` has not been written. So
# this is the project's own script at a path this project chose, and it is
# invoked by name rather than found by convention.
set -eu

# **The port the server listens on inside its cell.** `.foldai/application.edn`
# declares the same number to the product; this default keeps the two agreeing
# when nothing sets it.
: "${PORT:=5210}"

# **The address, and it has to be discovered because nothing tells us.**
# `server.js` binds `127.0.0.1` unless `HOST` says otherwise and **deliberately
# never `0.0.0.0`** — it is written to run on machines that sit on networks. A
# server on loopback inside a cell is invisible to the proxy in front of it and
# looks perfectly healthy from inside, so the cell's own address is what it must
# take. **Nothing in the environment carries it**, which is a fact about the
# product rather than about this script.
if [ -z "${HOST:-}" ]; then
  HOST=$(hostname -i 2>/dev/null | awk '{print $1}')
fi
[ -n "$HOST" ] || { echo "start.sh: no address to bind — set HOST" >&2; exit 2; }

export PORT HOST
echo "start.sh: node server.js on $HOST:$PORT"
exec node server.js
