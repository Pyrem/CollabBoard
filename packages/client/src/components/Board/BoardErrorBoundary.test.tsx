import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BoardErrorBoundary } from './BoardErrorBoundary';

/**
 * A child component that always throws during render,
 * used to trigger the error boundary.
 */
function ThrowingChild({ message }: { message: string }): never {
  throw new Error(message);
}

/**
 * A child component that renders normally.
 */
function GoodChild(): React.JSX.Element {
  return <div data-testid="good-child">All good</div>;
}

// Suppress noisy console.error output from React's error boundary logging
// and from our own componentDidCatch handler during tests.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BoardErrorBoundary', () => {
  describe('when children render successfully', () => {
    it('renders child content without fallback UI', () => {
      render(
        <BoardErrorBoundary>
          <GoodChild />
        </BoardErrorBoundary>,
      );

      expect(screen.getByTestId('good-child')).toBeDefined();
      expect(screen.queryByText('Something went wrong')).toBeNull();
    });
  });

  describe('when a child throws during render', () => {
    it('displays the fallback UI with heading', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="canvas exploded" />
        </BoardErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();
    });

    it('displays the error message in a pre block', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="canvas exploded" />
        </BoardErrorBoundary>,
      );

      expect(screen.getByText('canvas exploded')).toBeDefined();
    });

    it('displays the default description when no message prop is provided', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="boom" />
        </BoardErrorBoundary>,
      );

      expect(
        screen.getByText(
          /The board encountered a rendering error/,
        ),
      ).toBeDefined();
    });

    it('displays a custom message when the message prop is provided', () => {
      render(
        <BoardErrorBoundary message="Custom error context for the user.">
          <ThrowingChild message="boom" />
        </BoardErrorBoundary>,
      );

      expect(
        screen.getByText('Custom error context for the user.'),
      ).toBeDefined();
      expect(
        screen.queryByText(/The board encountered a rendering error/),
      ).toBeNull();
    });

    it('shows both recovery buttons', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="boom" />
        </BoardErrorBoundary>,
      );

      expect(screen.getByText('Try again')).toBeDefined();
      expect(screen.getByText('Reload page')).toBeDefined();
    });

    it('hides the original child content', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="boom" />
        </BoardErrorBoundary>,
      );

      expect(screen.queryByTestId('good-child')).toBeNull();
    });

    it('logs the error via componentDidCatch', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="logged error" />
        </BoardErrorBoundary>,
      );

      expect(console.error).toHaveBeenCalledWith(
        '[BoardErrorBoundary]',
        expect.objectContaining({ message: 'logged error' }),
        expect.any(String),
      );
    });
  });

  describe('recovery: "Try again" button', () => {
    it('re-renders children after clicking "Try again" when error is resolved', () => {
      let shouldThrow = true;

      function ToggleChild(): React.JSX.Element {
        if (shouldThrow) {
          throw new Error('transient error');
        }
        return <div data-testid="recovered">Back to normal</div>;
      }

      render(
        <BoardErrorBoundary>
          <ToggleChild />
        </BoardErrorBoundary>,
      );

      // Verify we're in the error state
      expect(screen.getByText('Something went wrong')).toBeDefined();

      // "Fix" the child before retrying
      shouldThrow = false;

      fireEvent.click(screen.getByText('Try again'));

      // Fallback should be gone, child should render
      expect(screen.queryByText('Something went wrong')).toBeNull();
      expect(screen.getByTestId('recovered')).toBeDefined();
    });

    it('falls back again if children still throw after retry', () => {
      render(
        <BoardErrorBoundary>
          <ThrowingChild message="persistent error" />
        </BoardErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();

      fireEvent.click(screen.getByText('Try again'));

      // Still broken — should show fallback again
      expect(screen.getByText('Something went wrong')).toBeDefined();
      expect(screen.getByText('persistent error')).toBeDefined();
    });
  });

  describe('recovery: "Reload page" button', () => {
    it('calls window.location.reload when clicked', () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
        configurable: true,
      });

      render(
        <BoardErrorBoundary>
          <ThrowingChild message="fatal" />
        </BoardErrorBoundary>,
      );

      fireEvent.click(screen.getByText('Reload page'));

      expect(reloadMock).toHaveBeenCalledOnce();
    });
  });

  describe('deeply nested child errors', () => {
    it('catches errors thrown by grandchild components', () => {
      function Parent(): React.JSX.Element {
        return (
          <div>
            <ThrowingChild message="grandchild blew up" />
          </div>
        );
      }

      render(
        <BoardErrorBoundary>
          <Parent />
        </BoardErrorBoundary>,
      );

      expect(screen.getByText('Something went wrong')).toBeDefined();
      expect(screen.getByText('grandchild blew up')).toBeDefined();
    });

    it('catches errors from one sibling and shows fallback', () => {
      render(
        <BoardErrorBoundary>
          <GoodChild />
          <ThrowingChild message="sibling error" />
        </BoardErrorBoundary>,
      );

      // The boundary catches the error and shows the fallback UI
      expect(screen.getByText('Something went wrong')).toBeDefined();
      expect(screen.getByText('sibling error')).toBeDefined();
    });
  });
});
