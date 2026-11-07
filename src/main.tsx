import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./styles.css";
import { Store } from "./store";
import { App } from "./App";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="auth">
        <h1>تعذر عرض الصفحة</h1>
        <p>أعد تحميل الصفحة للمحاولة مرة أخرى.</p>
        <button className="button primary" onClick={() => location.reload()}>
          إعادة التحميل
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <Store>
          <App />
        </Store>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
