import { Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <Provider>
      <App />
    </Provider>,
  );
}
