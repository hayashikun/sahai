import { Loader2 } from "lucide-react";
import type { LoadingAnimationType } from "shared";
import { cn } from "../lib/utils";

interface LoadingAnimationProps {
  type: LoadingAnimationType;
  className?: string;
}

export function LoadingAnimation({ type, className }: LoadingAnimationProps) {
  switch (type) {
    case "dots":
      return <DotsAnimation className={className} />;
    case "cat":
      return <RunningCatAnimation className={className} />;
    case "spinner":
      return <SpinnerAnimation className={className} />;
    case "typing":
      return <TypingAnimation className={className} />;
    default:
      return null;
  }
}

function DotsAnimation({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 font-mono text-gray-400",
        className,
      )}
    >
      <span className="animate-dots-blink animation-delay-0">●</span>
      <span className="animate-dots-blink animation-delay-200">●</span>
      <span className="animate-dots-blink animation-delay-400">●</span>
    </div>
  );
}

function RunningCatAnimation({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src="/walking-cat.gif"
        alt="Walking cat"
        className="h-5 w-auto"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

function SpinnerAnimation({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-gray-400", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-xs">Processing...</span>
    </div>
  );
}

function TypingAnimation({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing-bounce animation-delay-0" />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing-bounce animation-delay-150" />
      <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing-bounce animation-delay-300" />
    </div>
  );
}

// Animation labels for settings UI
export const LOADING_ANIMATION_LABELS: Record<LoadingAnimationType, string> = {
  dots: "Dots Blinking",
  cat: "Running Cat",
  spinner: "Spinner",
  typing: "Typing Indicator",
  none: "None",
};
