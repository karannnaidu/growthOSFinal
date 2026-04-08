'use client'

import React from 'react'
import { captureError } from '@/lib/error-tracking'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { componentStack: info.componentStack ?? undefined })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">
              An unexpected error occurred. Your data is safe — please try again.
            </p>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="max-w-sm overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg bg-[#6366f1]/15 px-4 py-2 text-sm font-medium text-[#6366f1] transition-colors hover:bg-[#6366f1]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
