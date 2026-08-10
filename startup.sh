#!/bin/sh
# **How this project runs.** The product runs `install.sh` first and never runs
# this if that failed — a project that could not be prepared and a project that
# would not start are different problems with different fixes.
#
# **This is all it should be.** What to run is the project's to say and the
# product never asks; anything elaborate here is a build step wearing a startup
# script's name.
set -eu

exec npm run dev
