import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// No StrictMode: its double-run of effects makes the audio and VexFlow
// setup noisier to reason about, and this app is simple enough without it.
createRoot(document.getElementById("root")!).render(<App />);
