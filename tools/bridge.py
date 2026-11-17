#!/usr/bin/env python3
"""Schlanker MCP-Client für die llm-bridge (stdio), damit Skripte Dateien direkt an
DeepSeek & Co. schicken können, ohne dass der Text durch Claude läuft.
Benutzung:  from bridge import Bridge;  Bridge().frage("deepseek", prompt, system=..., model=...)"""
import json, os, subprocess, sys

class Bridge:
    def __init__(self, befehl=os.path.expanduser("~/.local/bin/llm-bridge-mcp")):
        self.p = subprocess.Popen([befehl], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.n = 0
        self._rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                 "clientInfo": {"name": "zombies-tools", "version": "1"}})
        self._senden({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _senden(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n"); self.p.stdin.flush()

    def _rpc(self, methode, params):
        self.n += 1
        self._senden({"jsonrpc": "2.0", "id": self.n, "method": methode, "params": params})
        while True:
            zeile = self.p.stdout.readline()
            if not zeile:
                raise RuntimeError("llm-bridge beendet")
            try:
                antwort = json.loads(zeile)
            except json.JSONDecodeError:
                continue
            if antwort.get("id") == self.n:
                if "error" in antwort:
                    raise RuntimeError(antwort["error"])
                return antwort["result"]

    def call(self, werkzeug, argumente):
        r = self._rpc("tools/call", {"name": werkzeug, "arguments": argumente})
        return "".join(c.get("text", "") for c in r.get("content", []))

    def frage(self, provider, prompt, **weitere):
        return self.call("ask_model", {"provider": provider, "prompt": prompt, **weitere})

if __name__ == "__main__":
    print(Bridge().frage(sys.argv[1], sys.argv[2]))
