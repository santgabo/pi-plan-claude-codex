"""Exercise Pi's actual terminal dialogs in a disposable PTY, with no network."""
import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time

root, package, mode, scenario = sys.argv[1:5]
installed = len(sys.argv) > 5 and sys.argv[5] == "installed"
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 90, 0, 0))
env = {**os.environ, "TERM": "xterm-256color", "PI_OFFLINE": "1", "PI_CODING_AGENT_DIR": str(Path(root) / "agent"), "PI_PLAN_SCENARIO": scenario}
arguments = ["pi"] if installed else [
    "pi", "--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes",
    "--no-context-files", "--no-approve", "--no-session", "--tui-mode", mode,
    "--extension", str(Path(package) / "extensions/plan-mode/index.ts"),
    "--extension", str(Path(package) / "test/fixtures/provider.ts"),
    "--provider", "plan-fixture", "--model", "local",
    *([] if scenario == "shortcut" else ["--plan"]),
]
process = subprocess.Popen(arguments, cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
decoder = codecs.getincrementaldecoder("utf-8")("replace")
transcript = ""

def wait_for(text, after=0):
    global transcript
    deadline = time.monotonic() + 10
    while text not in transcript[after:]:
        if process.poll() is not None:
            raise AssertionError(f"Pi exited ({process.returncode}): {transcript[-2500:]}")
        if time.monotonic() > deadline:
            raise AssertionError(f"Missing {text!r}: {transcript[-2500:]}")
        if select.select([master], [], [], 0.1)[0]:
            transcript += decoder.decode(os.read(master, 65536))

def send(text):
    os.write(master, text.encode("utf-8"))
    time.sleep(0.03)

def shortcut_scenario():
    # Ctrl+Q: conventional control byte, CSI-u, and xterm modifyOtherKeys.
    sequences = ["\x11", "\x1b[113;5u", "\x1b[27;5;113~"]
    enabled = scenario == "shortcut-plan"
    wait_for("Plan mode" if enabled else "show full startup help")
    probes = 0

    def probe(submit=True):
        nonlocal probes
        offset = len(transcript)
        if submit:
            send("/fixture_probe draft-Ω\r")
        else:
            send("\r")
        probes += 1
        wait_for(f"SHORTCUT PROBE {probes}", offset)
        data = json.loads((Path(root) / "shortcut-probe.json").read_text())
        assert data["args"] == "draft-Ω", data  # No key bytes inserted or editor text lost.
        return data

    initial = probe()
    normal_tools = initial["state"]["toolsBeforePlan"] if enabled else initial["tools"]
    # The removed shortcut must neither toggle nor disturb the editor draft.
    for sequence in ["\x1b\x10", "\x1b[112;7u", "\x1b[27;7;112~"]:
        send("/fixture_probe draft-Ω")
        send(sequence)
        data = probe(submit=False)
        assert data["state"]["enabled"] == enabled, data
        assert data["tools"] == initial["tools"] and data["requests"] == 0, data
    for sequence in sequences:
        for _ in range(2):
            send("/fixture_probe draft-Ω")
            offset = len(transcript)
            send(sequence)
            enabled = not enabled
            wait_for("Plan mode enabled." if enabled else "Plan mode disabled.", offset)
            data = probe(submit=False)
            assert data["state"]["enabled"] == enabled, data
            assert data["requests"] == 0, data
            if enabled:
                assert "write" not in data["tools"] and "plan_submit" in data["tools"], data
            else:
                assert data["tools"] == normal_tools, data
    if not enabled:
        offset = len(transcript)
        send(sequences[0])
        wait_for("Plan mode enabled.", offset)
    before = probe()
    send("Plan a small implementation\r")
    deadline = time.monotonic() + 10
    while not (Path(root) / "shortcut-request.json").exists():
        assert time.monotonic() < deadline, "The offline request did not start"
        time.sleep(0.01)
    request = json.loads((Path(root) / "shortcut-request.json").read_text())
    assert request["userText"] == "Plan a small implementation", request
    send("/fixture_probe draft-Ω")
    offset = len(transcript)
    send(sequences[1])
    wait_for("Wait for the turn to finish before changing plan mode.", offset)
    (Path(root) / "shortcut-release").touch()
    wait_for("Execute in this conversation")
    # Native review owns focus. The shortcut must not toggle behind the dialog.
    send(sequences[2])
    send("\x1b")
    data = probe(submit=False)
    assert data["requests"] == 1 and data["state"]["enabled"], data
    assert data["tools"] == before["tools"], data
    assert data["state"]["proposal"]["review"] == "held", data
    proposal = data["state"]["proposal"]
    for enabled in [False, True]:
        offset = len(transcript)
        send(sequences[0])
        wait_for("Plan mode enabled." if enabled else "Plan mode disabled.", offset)
        data = probe()
        assert data["state"]["enabled"] == enabled, data
        assert data["state"]["proposal"] == proposal, data
        assert data["requests"] == 1, data
        if not enabled:
            assert data["tools"] == normal_tools, data
    assert not (Path(root) / "implementation.txt").exists()

try:
    if scenario.startswith("shortcut"):
        shortcut_scenario()
    elif installed:
        wait_for("show full startup help")
        assert "Plan mode" not in transcript
        send("/plan\r")
    if not scenario.startswith("shortcut"):
        wait_for("Plan mode")
        send("Plan a small implementation\r" if installed else "/plan Plan a small implementation\r")
    if scenario == "question":
        wait_for("Should we include a simplification improvement?")
        offset = len(transcript)
        send("\x1b[B")
        send("\x1b[B")
        send("\r")
        wait_for("Should we include a simplification improvement?", offset)
        send("Yes, simplify without expanding the scope\r")
        wait_for("ANSWER RECEIVED")
        assert not (Path(root) / "implementation.txt").exists()
    elif not scenario.startswith("shortcut"):
        if scenario == "recovery":
            wait_for("Keep the revised scope small?")
            send("Yes\r")
            wait_for("Execute in this conversation")
            offset = len(transcript)
            send("\x1b[B")
            send("\r")
            wait_for("What would you like to change or improve?", offset)
            offset = len(transcript)
            send("Keep validation simple\r")
            wait_for("Keep the revised scope small?", offset)
            send("Yes\r")
            wait_for("Review 2:", offset)
        wait_for("Execute in this conversation")
        assert not (Path(root) / "implementation.txt").exists()
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 22, 46, 0, 0))
        os.kill(process.pid, signal.SIGWINCH)
        send("\x1b[B")
        send("\x1b[B")
        send("\r")
        wait_for("IMPLEMENTED")
        assert (Path(root) / "implementation.txt").read_text() == "APPROVED\n"
    send("/quit\r")
    deadline = time.monotonic() + 4
    while process.poll() is None and time.monotonic() < deadline:
        if select.select([master], [], [], 0.1)[0]:
            try:
                transcript += decoder.decode(os.read(master, 65536))
            except OSError:
                break
    process.wait(timeout=1)
    assert process.returncode == 0, transcript[-2500:]
    print(f"TUI {mode} {scenario}: OK")
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
    os.close(master)
