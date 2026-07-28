import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Panel } from "./panel";

createRoot(document.getElementById("react-controls-root")!).render(
  <StrictMode>
    <div className="dark isolate">
      <Panel />
    </div>
  </StrictMode>,
);
