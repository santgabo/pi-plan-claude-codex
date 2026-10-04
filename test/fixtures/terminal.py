"""Exercise Pi's actual terminal dialogs in a disposable PTY, with no network."""
import codecs
import fcntl
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
    "--provider", "plan-fixture", "--model", "local", "--plan",
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

try:
    if installed:
        wait_for("show full startup help")
        assert "Plan mode" not in transcript
        send("/plan\r")
    wait_for("Plan mode")
    send("Planifica una implementación pequeña\r" if installed else "/plan Planifica una implementación pequeña\r")
    if scenario == "question":
        wait_for("¿Incluimos una mejora de simplicidad?")
        offset = len(transcript)
        send("\x1b[B")
        send("\x1b[B")
        send("\r")
        wait_for("¿Incluimos una mejora de simplicidad?", offset)
        send("Sí, simplifica sin ampliar el alcance\r")
        wait_for("RESPUESTA RECIBIDA")
        assert not (Path(root) / "implementation.txt").exists()
    else:
        wait_for("Ejecutar en esta conversación")
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
