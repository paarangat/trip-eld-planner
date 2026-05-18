import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            maxWidth: 640,
            margin: "10vh auto",
            padding: "2rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)" }}>
            Try reloading the page. If the problem persists, contact dispatch.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
