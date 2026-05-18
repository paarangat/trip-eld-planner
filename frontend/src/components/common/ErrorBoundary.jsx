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
            background: "#fff",
            border: "1px solid #d9d5c5",
            borderRadius: 14,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p>Try reloading the page. If the problem persists, contact dispatch.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
