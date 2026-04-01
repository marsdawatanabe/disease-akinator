// 目的: ユーザーがアクションを実行できる汎用ボタンコンポーネント
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#005C55] text-white hover:bg-[#0F766E] focus-visible:ring-[#005C55]",
        destructive:
          "bg-[#BA1A1A] text-white hover:bg-[#9b1515] focus-visible:ring-[#BA1A1A]",
        outline:
          "border-2 border-[#005C55] text-[#005C55] bg-transparent hover:bg-[#005C55]/10",
        ghost: "text-[#005C55] hover:bg-[#005C55]/10",
        secondary:
          "bg-[#F2F4F6] text-[#191C1E] hover:bg-[#E5E7EA]",
      },
      size: {
        default: "h-14 px-8 rounded-full text-base",
        sm: "h-10 px-6 rounded-full text-sm",
        lg: "h-16 px-10 rounded-full text-lg",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
