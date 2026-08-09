# foldai-reload-demo

A tiny web page that **reloads itself over a websocket** when the files it is
made of change.

## What it is for

This repository exists to be **edited by an AI agent while someone watches the
page**. It is the test subject for an end-to-end run: a control plane cuts a git
worktree of this repo onto an execution node, an agent edits a file in that
worktree, and a browser pointed at the server shows the change without anyone
touching the reload button.

So the only thing it optimises for is being obvious. `content.html` is the
visible body of the page. Change a word in it and the browser shows that word.

## Start it

```sh
npm install
npm start
```

Then open <http://127.0.0.1:5210>.

Two dependencies-worth of machinery, one actual dependency (`ws`), no build
step, no global tooling.

## Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `5210` | The port both listeners use. |
| `HOST` | `127.0.0.1` | A second address to listen on, in addition to loopback. |

The server always listens on `127.0.0.1`, and additionally on `HOST` when that
is set to something else — **two explicit listeners, never `0.0.0.0`**. A wide
bind exposes the dev server to every machine on the network it happens to be on.

To reach it from another machine, name the interface:

```sh
HOST=10.0.0.4 PORT=5210 npm start
```

## Editing it

Change anything under the project root — `content.html` is the interesting one —
and every connected browser reloads. `server.js` and the page shell inside it are
watched too, but changing those needs the server restarted; the page will reload
itself on reconnect because the server's boot id changed.

## How the reload works

- The page opens a websocket to `/__reload`.
- `fs.watch` on the project root (skipping `node_modules` and `.git`) broadcasts
  `{"type":"reload"}` on change, debounced so one save is one reload.
- The server sends a heartbeat every 20s and drops sockets that stop answering.
  The client arms a 60s watchdog against that heartbeat, and reconnects with
  backoff — so an idle timeout at a proxy or public edge does not leave a page
  silently attached to a dead socket.
- On reconnect the server's boot id is compared with the one the page was
  serving under; a different id means the server restarted and the page reloads.

`GET /healthz` returns the boot id and the number of connected clients.
