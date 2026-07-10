import { render, screen, act } from "@testing-library/react";
import { ToastProvider, TOAST_MS } from "../ToastProvider";
import { useToast } from "../../hooks/useToast";

function Probe() {
  const { show } = useToast();
  return <button onClick={() => show("Deposited. Agent is allocating.")}>fire</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const MSG = "Deposited. Agent is allocating.";

test("show() puts the message on screen", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "fire" }).click());
  expect(screen.getByText(MSG)).toBeInTheDocument();
});

test("the toast dismisses itself after TOAST_MS", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  act(() => screen.getByRole("button", { name: "fire" }).click());
  act(() => void vi.advanceTimersByTime(TOAST_MS - 1));
  expect(screen.getByText(MSG)).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(1));
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
});

// The bug this guards: with `useState<string>`, showing the *same* message twice is an
// Object.is-equal state write. React bails out, the dismiss effect never re-runs, and the
// second toast inherits the first one's already-half-spent timer.
test("re-showing the same message restarts the dismiss timer", () => {
  render(<ToastProvider><Probe /></ToastProvider>);
  const fire = screen.getByRole("button", { name: "fire" });
  act(() => fire.click());
  act(() => void vi.advanceTimersByTime(TOAST_MS - 100));
  act(() => fire.click()); // same message, again
  act(() => void vi.advanceTimersByTime(200)); // past the *first* timer's deadline
  expect(screen.getByText(MSG)).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(TOAST_MS));
  expect(screen.queryByText(MSG)).not.toBeInTheDocument();
});

test("useToast() outside the provider throws", () => {
  // React logs the error boundary-less throw; silence it so the run stays readable.
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/useToast must be used within <ToastProvider>/);
  spy.mockRestore();
});
