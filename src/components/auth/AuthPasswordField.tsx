import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

type AuthPasswordFieldProps = ComponentProps<"input">;

export function AuthPasswordField({
  className,
  id,
  placeholder = "Password",
  autoComplete = "current-password",
  ...props
}: AuthPasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const ToggleIcon = showPassword ? EyeOff : Eye;

  return (
    <div className="mt-3 flex h-11 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background/70 pl-4 pr-2 sm:mt-4 sm:h-12">
      <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        id={inputId}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(
          "h-full w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80 outline-none",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => setShowPassword((current) => !current)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-controls={inputId}
      >
        <ToggleIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
