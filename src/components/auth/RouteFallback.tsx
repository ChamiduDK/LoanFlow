type RouteFallbackProps = {
  message: string;
};

export default function RouteFallback({ message }: RouteFallbackProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
