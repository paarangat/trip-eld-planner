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
        <div role="alert" className="error-boundary">
          Something went wrong. Try reloading the page.
        </div>
      );
    }
    return this.props.children;
  }
}
