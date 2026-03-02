import React from 'react';
import { Send } from 'lucide-react';
import './AnimatedSendButton.css';

interface AnimatedSendButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // Add any custom props here if needed
}

export const AnimatedSendButton = React.forwardRef<HTMLButtonElement, AnimatedSendButtonProps>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`animated-send-button ${className || ''}`}
        disabled={disabled}
        {...props}
      >
        <Send className="h-4 w-4" />
        <span className="sr-only">Send Message</span>
      </button>
    );
  }
);
AnimatedSendButton.displayName = 'AnimatedSendButton';
