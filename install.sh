#!/bin/sh
# **How this project is prepared.** The product runs this, then `startup.sh`, and
# looks for both at the repository root and nowhere else.
#
# **It runs on EVERY cell and must be safe to run again.** A cell is created when
# a worktree is cut and again wherever a lease moves, so this is re-executed
# against a fresh machine each time rather than resumed. Nothing caches its
# effect across cells.
#
# **So it does not check whether the work is already done and skip.** A script
# that installs once and assumes thereafter produces a worktree that works on the
# node it was cut on and nowhere else — which is the failure this file's contract
# exists to prevent, and it is invisible until the second cell.
set -eu

# `npm ci` rather than `npm install`: it installs exactly the lockfile, and it
# deletes and rebuilds `node_modules` rather than reconciling one it finds. That
# is the property this script needs — the same input gives the same tree on a
# machine that has none, every time.
npm ci --no-audit --no-fund
