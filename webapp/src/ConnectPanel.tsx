// Archipelago connection panel plus the offline dev mode toggle. Offline
// mode grants unlocks from public/offline-unlocks.json so the game is
// playable without a server.

import { useState } from "react";

interface ConnectPanelProps {
  connected: boolean;
  offlineMode: boolean;
  statusText: string;
  onConnect: (host: string, port: string, slot: string) => void;
  onToggleOffline: (enabled: boolean) => void;
}

export function ConnectPanel(props: ConnectPanelProps) {
  const [host, setHost] = useState("archipelago.gg");
  const [port, setPort] = useState("38281");
  const [slot, setSlot] = useState("Player1");

  return (
    <div className="connect-panel">
      <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" />
      <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="port" className="port" />
      <input value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="slot" />
      <button onClick={() => props.onConnect(host, port, slot)} disabled={props.connected}>
        {props.connected ? "Connected" : "Connect"}
      </button>

      <label className="offline-toggle">
        <input
          type="checkbox"
          checked={props.offlineMode}
          onChange={(e) => props.onToggleOffline(e.target.checked)}
        />
        Offline dev mode
      </label>

      <span className="status-text">{props.statusText}</span>
    </div>
  );
}
