"use client";

// Stepper: visual progress indicator for the setup wizard. Renders an
// ordered list of step indicators with three states (completed / active /
// future) keyed off the supplied `currentIndex`. Receives only the step
// list it should display — Language and Welcome are upstream concerns and
// must be excluded by the parent before rendering.

interface Step {
  id: string;
  label: string;
}

interface Props {
  steps: Step[];
  currentIndex: number;
}

type State = "completed" | "active" | "future";

function getState(i: number, currentIndex: number): State {
  if (i < currentIndex) return "completed";
  if (i === currentIndex) return "active";
  return "future";
}

function indicatorClass(state: State): string {
  if (state === "completed") {
    return "bg-accent-teal text-white";
  }
  if (state === "active") {
    return "bg-accent text-white ring-2 ring-accent/30";
  }
  return "bg-warm-light text-warm-silver";
}

function connectorClass(leftState: State): string {
  return leftState === "completed" ? "bg-accent-teal" : "bg-bg-border";
}

export function Stepper({ steps, currentIndex }: Props): React.ReactElement {
  const total = steps.length;
  const safeIndex = Math.min(Math.max(currentIndex, 0), total - 1);

  return (
    <div className="w-full">
      {/* Mobile: compact progress display ("3 / 5") only. Detailed
          per-step labels live in the desktop list below — duplicating
          them on mobile would force test queries to disambiguate. */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <span className="text-sm font-medium text-text-primary">
          {safeIndex + 1} / {total}
        </span>
      </div>

      {/* Desktop: full numbered list */}
      <ol role="list" className="hidden md:flex md:items-center md:gap-2">
        {steps.map((step, i) => {
          const state = getState(i, currentIndex);
          const isLast = i === total - 1;
          const itemAria =
            state === "active" ? { "aria-current": "step" as const } : {};
          return (
            <li
              key={step.id}
              role="listitem"
              {...itemAria}
              className="flex flex-1 items-center"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${indicatorClass(state)}`}
                >
                  {state === "completed" ? "✓" : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-sm ${
                    state === "future"
                      ? "text-text-muted"
                      : "text-text-primary font-medium"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-px flex-1 ${connectorClass(state)}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default Stepper;
