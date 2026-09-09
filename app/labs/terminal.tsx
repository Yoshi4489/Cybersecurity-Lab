"use client";
import { useEffect, useRef, useState } from "react";
import { localControllerUrl } from "../controller-client";
import "@xterm/xterm/css/xterm.css";

export function LabTerminal({ runId }: { runId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("Connecting terminal…");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (disposed || !container.current) return;
      const terminal = new Terminal({ cursorBlink: true, fontSize: 15, screenReaderMode: true, scrollback: 3000, theme: { background: "#090d0a", foreground: "#c4e8ce" }, linkHandler: { activate: () => {} } });
      const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(container.current); fit.fit();
      const socket = new WebSocket(`${localControllerUrl().replace(/^http/, "ws")}/api/instances/${runId}/terminal`, "reconlab.terminal.v1");
      const send = (value: object) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
      terminal.onData((data) => send({ type: "input", data }));
      terminal.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
      socket.onmessage = (event) => {
        if (disposed) return;
        const result = JSON.parse(event.data);
        if (result.type === "status" && result.message === "Connected") {
          setMessage("Connected. Commands run inside your lab toolbox.");
          send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
        }
        if (result.type === "output") terminal.write(Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0)));
      };
      socket.onclose = (event) => {
        if (disposed) return;
        const reason = (event.reason || "").replace(/\.\s*$/, "");
        if (/expired|stopped/i.test(reason)) setMessage("Your lab session ended: the lease expired or the instance stopped. Click Start / resume to continue. Toolbox /tmp files are cleared when a lab stops, so download evidence again after resuming.");
        else if (!reason || event.code === 1006) setMessage("Terminal disconnected. If this lab is open in another browser tab, close it; otherwise click Reconnect terminal.");
        else setMessage(`${reason}. Click Reconnect terminal, or Start / resume if the lab has stopped.`);
      };
      const observer = new ResizeObserver(() => fit.fit()); observer.observe(container.current);
      cleanup = () => { observer.disconnect(); socket.close(); terminal.dispose(); };
    }).catch(() => { if (!disposed) setMessage("Terminal could not load. Refresh this page to retry."); });
    return () => { disposed = true; cleanup(); };
  }, [runId, attempt]);
  return <section className="terminal-panel" aria-label="Investigation terminal"><div className="workspace-actions"><strong>Investigation toolbox</strong><button onClick={() => { setMessage("Reconnecting…"); setAttempt((value) => value + 1); }}>Reconnect terminal</button></div><p role="status">{message}</p><div className="terminal-screen" ref={container} /><p>In this toolbox terminal, copy selected text with Ctrl+Shift+C and paste with Ctrl+Shift+V (Cmd+C / Cmd+V on macOS). The flag box on this page uses the normal Ctrl+V / Cmd+V. Reconnecting keeps your shell while the instance is running.</p></section>;
}
