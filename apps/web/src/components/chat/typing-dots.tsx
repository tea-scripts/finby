export function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1" aria-label="Finby is typing">
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-muted [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-muted [animation-delay:200ms]" />
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-muted [animation-delay:400ms]" />
    </div>
  );
}
