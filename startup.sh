#!/bin/sh
# Starts the server under the cell's supervisor. POSIX sh, same as install.sh.
set -eu

# 7000 is fixed by the system that serves this app: it dials the cell's own
# loopback on that port and proxies whatever answers, HTTP and websocket
# upgrades alike. A server on any other port is a cell that starts cleanly,
# reports healthy, and serves nothing.
PORT=7000

# Pinned rather than left to server.js's default. If the cell's environment
# already carries a HOST, server.js opens a second listener on that address as
# well — a dev server on an interface nobody asked for. Naming it here means
# exactly one listener, on loopback, which is all the proxy ever dials.
HOST=127.0.0.1

export PORT HOST

# `exec`, so the process the supervisor started *is* node. Without it the shell
# stays alive as node's parent and receives the stop signal itself; node is
# orphaned still holding port 7000, and the next start dies on EADDRINUSE.
exec node server.js
