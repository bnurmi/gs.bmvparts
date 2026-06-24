import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Strip server-injected [data-bmv-ssr] head nodes so React Helmet owns
// the head once hydrated. Body SSR inside #root is replaced by React.
for (const el of Array.from(document.head.querySelectorAll("[data-bmv-ssr]"))) {
  el.parentNode?.removeChild(el);
}

createRoot(document.getElementById("root")!).render(<App />);
