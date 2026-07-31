"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AICoachErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Do not include message content, session IDs, or user details in logs.
    console.error("[AI Coach] rendering failed", { name: error.name });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 80, maxWidth: 300, padding: 14, borderRadius: 14, background: "#FFF5F8", border: "1px solid #F5D0DC", color: "#9D174D", fontSize: 13, lineHeight: 1.7 }}>
          تعذر فتح المساعد مؤقتًا، حاول مرة أخرى.
        </div>
      );
    }

    return this.props.children;
  }
}
