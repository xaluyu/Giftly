"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used within <Tabs />");
  return ctx;
}

function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const value = valueProp ?? uncontrolled;

  const setValue = React.useCallback(
    (v: string) => {
      onValueChange?.(v);
      if (valueProp === undefined) setUncontrolled(v);
    },
    [onValueChange, valueProp]
  );

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div data-slot="tabs" className={cn("grid gap-4", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-full items-center justify-start rounded-xl bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const { value: active, setValue } = useTabsContext();
  const isActive = active === value;

  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      data-state={isActive ? "active" : "inactive"}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const { value: active } = useTabsContext();
  if (active !== value) return null;

  return (
    <div
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

